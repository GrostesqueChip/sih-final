const express = require('express');
const router = express.Router();
const prisma = require('../lib/prisma');
const { verifyToken, requireRole } = require('../middleware/auth');
const { createAuditLog, getClientIp } = require('../middleware/auditLog');
const { complianceFor } = require('../services/compliance');

/**
 * GET /api/dashboard/stats
 * Aggregate key metrics, KPI counts, and pass/fail distributions
 */
router.get('/stats', verifyToken, async (req, res, next) => {
  try {
    const [
      totalInstruments,
      activeInstruments,
      totalTestSessions,
      completedTests,
      inProgressTests,
      passedTests,
      failedTests,
      instrumentsByClass,
      instrumentsByType,
      testsByModule,
    ] = await Promise.all([
      prisma.instrument.count(),
      prisma.instrument.count({ where: { isActive: true } }),
      prisma.testSession.count(),
      prisma.testSession.count({ where: { status: 'COMPLETED' } }),
      prisma.testSession.count({ where: { status: 'IN_PROGRESS' } }),
      prisma.testSession.count({ where: { overallResult: 'PASS' } }),
      prisma.testSession.count({ where: { overallResult: 'FAIL' } }),
      prisma.instrument.groupBy({
        by: ['accuracyClass'],
        _count: { _all: true },
      }),
      prisma.instrument.groupBy({
        by: ['type'],
        _count: { _all: true },
      }),
      // Individual OIML R-76 test modules actually executed, so the
      // "Tests Conducted by Category" chart reports real module counts rather
      // than a relabelled session-status breakdown.
      prisma.testResult.groupBy({
        by: ['testType'],
        _count: { _all: true },
      }),
    ]);

    const passRate = completedTests > 0 ? Number(((passedTests / completedTests) * 100).toFixed(1)) : 0;

    // ---- Registry compliance, workload and revenue (derived from real records) ----
    const [allInstruments, allSessions] = await Promise.all([
      prisma.instrument.findMany({
        where: { isActive: true },
        include: {
          testSessions: {
            select: { id: true, certificateNo: true, status: true, overallResult: true, completedAt: true, sealedAt: true, verificationType: true },
          },
        },
      }),
      prisma.testSession.findMany({
        include: {
          instrument: { select: { id: true, name: true, district: true, type: true } },
          conductedBy: { select: { id: true, name: true } },
        },
      }),
    ]);

    const complianceCounts = { VALID: 0, DUE_SOON: 0, EXPIRED: 0, REJECTED: 0, NOT_VERIFIED: 0 };
    const attention = [];
    const districtMap = new Map();
    for (const inst of allInstruments) {
      const c = complianceFor(inst.testSessions || []);
      complianceCounts[c.status] += 1;
      if (c.status !== 'VALID') {
        attention.push({
          id: inst.id,
          name: inst.name,
          serialNumber: inst.serialNumber,
          location: inst.location,
          district: inst.district,
          type: inst.type,
          ...c,
        });
      }
      const key = inst.district || 'Unassigned';
      if (!districtMap.has(key)) districtMap.set(key, { district: key, instruments: 0, compliant: 0, rejected: 0, verifications: 0 });
      const row = districtMap.get(key);
      row.instruments += 1;
      if (c.status === 'VALID' || c.status === 'DUE_SOON') row.compliant += 1;
      if (c.status === 'REJECTED') row.rejected += 1;
    }
    const severity = { REJECTED: 0, EXPIRED: 1, DUE_SOON: 2, NOT_VERIFIED: 3 };
    attention.sort((a, b) => severity[a.status] - severity[b.status] || (a.daysRemaining ?? 0) - (b.daysRemaining ?? 0));

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    // Indian financial year starts 1 April.
    const fyStart = new Date(now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1, 3, 1);
    let verificationsThisMonth = 0;
    let feesThisFy = 0;
    const officerMap = new Map();
    for (const sess of allSessions) {
      const done = sess.completedAt ? new Date(sess.completedAt) : null;
      if (done && done >= monthStart) verificationsThisMonth += 1;
      if (done && done >= fyStart && sess.feeAmount) feesThisFy += Number(sess.feeAmount);
      const d = sess.instrument?.district || 'Unassigned';
      if (districtMap.has(d)) districtMap.get(d).verifications += 1;
      if (sess.conductedBy) {
        const o = officerMap.get(sess.conductedBy.id) || { id: sess.conductedBy.id, name: sess.conductedBy.name, sessions: 0, passed: 0, failed: 0, open: 0 };
        o.sessions += 1;
        if (sess.status === 'COMPLETED' && sess.overallResult === 'PASS') o.passed += 1;
        else if (sess.overallResult === 'FAIL') o.failed += 1;
        else o.open += 1;
        officerMap.set(sess.conductedBy.id, o);
      }
    }

    return res.json({
      success: true,
      stats: {
        totalInstruments,
        activeInstruments,
        totalTestSessions,
        completedTests,
        inProgressTests,
        passedTests,
        failedTests,
        passRate,
        instrumentsByClass: instrumentsByClass.map(c => ({
          accuracyClass: c.accuracyClass,
          count: c._count._all,
        })),
        instrumentsByType: instrumentsByType.map(t => ({
          type: t.type,
          count: t._count._all,
        })),
        testsByModule: testsByModule.map(m => ({
          testType: m.testType,
          count: m._count._all,
        })),
        compliance: complianceCounts,
        attention: attention.slice(0, 8),
        verificationsThisMonth,
        feesThisFy,
        financialYear: `${fyStart.getFullYear()}-${String((fyStart.getFullYear() + 1) % 100).padStart(2, '0')}`,
        districts: [...districtMap.values()].sort((a, b) => b.instruments - a.instruments),
        officers: [...officerMap.values()].sort((a, b) => b.sessions - a.sessions),
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/dashboard/recent
 * Retrieve last 20 test sessions and last 20 audit log entries
 */
router.get('/recent', verifyToken, async (req, res, next) => {
  try {
    const [recentSessions, recentAuditLogs] = await Promise.all([
      prisma.testSession.findMany({
        take: 20,
        orderBy: { createdAt: 'desc' },
        include: {
          instrument: {
            select: {
              id: true,
              name: true,
              model: true,
              type: true,
              serialNumber: true,
              accuracyClass: true,
            },
          },
          conductedBy: {
            select: { id: true, name: true, email: true },
          },
        },
      }),
      prisma.auditLog.findMany({
        take: 20,
        orderBy: { createdAt: 'desc' },
        include: {
          user: {
            select: { id: true, name: true, email: true, role: true },
          },
        },
      }),
    ]);

    return res.json({
      success: true,
      recentSessions,
      recentAuditLogs,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/dashboard/trends?months=6
 *
 * Genuine month-by-month verification outcomes for the compliance chart.
 * Previously the client derived this client-side from the 20 most recent
 * sessions and labelled the result "last 6 months", which is not the same
 * thing and silently under-reports whenever more than 20 sessions exist.
 *
 * A session is bucketed by the date it was concluded (completedAt), falling
 * back to when it started. Sessions still open are reported separately and are
 * never counted as compliant — an unfinished verification is not a pass.
 */
router.get('/trends', verifyToken, async (req, res, next) => {
  try {
    const requested = Number.parseInt(req.query.months, 10);
    const months = Number.isFinite(requested) ? Math.min(Math.max(requested, 1), 24) : 6;

    const now = new Date();
    // First instant of the month that begins the window (inclusive).
    const windowStart = new Date(now.getFullYear(), now.getMonth() - (months - 1), 1, 0, 0, 0, 0);

    const buckets = [];
    const indexByKey = new Map();
    for (let i = 0; i < months; i += 1) {
      const d = new Date(windowStart.getFullYear(), windowStart.getMonth() + i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      indexByKey.set(key, buckets.length);
      buckets.push({
        monthKey: key,
        month: d.toLocaleString('en-IN', { month: 'short' }),
        year: d.getFullYear(),
        passed: 0,
        failed: 0,
        inProgress: 0,
      });
    }

    const sessions = await prisma.testSession.findMany({
      where: { createdAt: { gte: windowStart } },
      orderBy: { createdAt: 'asc' },
    });

    for (const session of sessions) {
      const when = new Date(session.completedAt || session.startedAt || session.createdAt);
      if (Number.isNaN(when.getTime())) continue;

      const key = `${when.getFullYear()}-${String(when.getMonth() + 1).padStart(2, '0')}`;
      const idx = indexByKey.get(key);
      if (idx === undefined) continue;

      if (session.status === 'COMPLETED') {
        if (session.overallResult === 'FAIL') buckets[idx].failed += 1;
        else if (session.overallResult === 'PASS') buckets[idx].passed += 1;
      } else if (session.status === 'FAILED') {
        buckets[idx].failed += 1;
      } else {
        buckets[idx].inProgress += 1;
      }
    }

    const totalPassed = buckets.reduce((sum, b) => sum + b.passed, 0);
    const totalFailed = buckets.reduce((sum, b) => sum + b.failed, 0);
    const concluded = totalPassed + totalFailed;

    return res.json({
      success: true,
      months,
      from: windowStart.toISOString(),
      to: now.toISOString(),
      totals: {
        passed: totalPassed,
        failed: totalFailed,
        inProgress: buckets.reduce((sum, b) => sum + b.inProgress, 0),
        // Null (not 100) when nothing has concluded, so the UI can say
        // "no data" instead of claiming a perfect compliance record.
        passRate: concluded > 0 ? Number(((totalPassed / concluded) * 100).toFixed(1)) : null,
      },
      trends: buckets,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/dashboard/reset-demo  (Controller only, in-memory demo mode only)
 * Restores the demonstration dataset so an evaluator can start afresh.
 */
router.post('/reset-demo', verifyToken, requireRole('ADMIN'), async (req, res, next) => {
  try {
    const mockDb = require('../lib/mockDb');
    const inMemory = typeof prisma.isUsingFallback === 'function' ? prisma.isUsingFallback() : String(process.env.NAWI_DB_MODE || '').toLowerCase() === 'memory' || !process.env.DATABASE_URL;
    if (!inMemory) {
      return res.status(409).json({ success: false, message: 'Demo reset is only available in in-memory demo mode.' });
    }
    mockDb.resetDemoData();
    await createAuditLog({
      userId: req.user.id,
      action: 'RESET_DEMO_DATA',
      entityType: 'System',
      entityId: 'DEMO',
      details: `${req.user.name || 'Controller'} restored the demonstration dataset.`,
      ipAddress: getClientIp(req),
    });
    return res.json({ success: true, message: 'Demonstration data restored.' });
  } catch (error) {
    next(error);
  }
});

module.exports = router;