/**
 * Resilient Offline Batch Sync Controller
 * Conforms to OIML R-76 & Indian Legal Metrology Field Sync Specifications
 * Executes transactional batch insertion with strict idempotency key deduplication.
 */

const prisma = require('../lib/prisma');
const { evaluateTestResult } = require('../services/mpeCalculator');
const { getClientIp } = require('../middleware/auditLog');
const { generateVerificationSeal, buildSealInput } = require('../services/cryptoSeal');
const { ALL_REQUIRED_TEST_TYPES, generateCertificateNumber } = require('../lib/verificationRegister');

// In-memory idempotency cache for fast deduplication
const idempotencyStore = new Map();

/**
 * POST /api/sync/batch
 * Process batch of offline test sessions with idempotency deduplication
 */
async function syncBatch(req, res, next) {
  try {
    const { idempotencyKey: batchKey, timestamp, offlineOfficerId, sessions = [] } = req.body;

    if (!Array.isArray(sessions)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid payload: "sessions" must be an array of test session objects.',
      });
    }

    if (!batchKey || typeof batchKey !== 'string' || !batchKey.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Missing or empty required field: idempotencyKey is required for batch sync.',
      });
    }

    if (sessions.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No sessions provided in batch sync payload.',
      });
    }

    // Check in-memory idempotency cache if batchKey is present (Express HTTP routes)
    if (req.app && batchKey && idempotencyStore.has(batchKey)) {
      const cached = idempotencyStore.get(batchKey);
      return res.status(200).json({
        success: true,
        idempotentReplay: true,
        syncedCount: cached.syncedCount,
        sessionIds: cached.sessionIds,
        message: 'Batch already processed successfully (idempotent replay).',
      });
    }

    // Determine acting officer user ID (SEC-CRIT-04: authenticated user ID, no hardcoded 'usr-officer-01')
    const officerId = req.user?.id || offlineOfficerId;
    if (!officerId) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required. No officer credentials identified.',
      });
    }

    const processedKeys = [];
    const syncedSessionIds = [];
    const syncResults = [];
    let duplicateCount = 0;
    let syncedCount = 0;
    let failedCount = 0;

    for (const sessionData of sessions) {
      const itemKey = sessionData.idempotencyKey || sessionData.localId || `sync_${Date.now()}_${Math.random()}`;
      const localId = sessionData.localId || itemKey;
      const reject = (message) => {
        failedCount++;
        syncResults.push({
          localId,
          idempotencyKey: itemKey,
          sessionId: null,
          certificateNo: null,
          status: 'FAILED',
          error: message,
          syncedAt: new Date().toISOString(),
        });
      };

      // 1. Idempotency: a key already recorded in the audit trail is not written twice.
      let existingAudit = null;
      try {
        existingAudit = await prisma.auditLog.findFirst({
          where: { action: 'OFFLINE_SYNC_SESSION', details: { contains: itemKey } },
          select: { entityId: true, createdAt: true },
        });
      } catch (err) {
        existingAudit = null;
      }

      if (existingAudit && existingAudit.entityId) {
        duplicateCount++;
        processedKeys.push(itemKey);
        syncedSessionIds.push(existingAudit.entityId);
        syncResults.push({
          localId,
          idempotencyKey: itemKey,
          sessionId: existingAudit.entityId,
          status: 'DUPLICATE_SKIPPED',
          message: 'Session previously synced; duplicate write prevented.',
          syncedAt: existingAudit.createdAt,
        });
        continue;
      }

      // 2. The instrument must already be on the register.
      const instrument = sessionData.instrumentId
        ? await prisma.instrument.findUnique({ where: { id: sessionData.instrumentId } }).catch(() => null)
        : null;
      if (!instrument) {
        reject(`Instrument '${sessionData.instrumentId || ''}' is not on the register.`);
        continue;
      }

      // 3. Re-evaluate every module on the server. Verdicts sent by the device
      //    (passed / result / overallResult / overallStatus) are ignored: the
      //    verdict is always computed from the readings, as in online mode.
      const evaluated = [];
      let invalidModule = null;
      for (const r of Array.isArray(sessionData.results) ? sessionData.results : []) {
        if (!ALL_REQUIRED_TEST_TYPES.includes(r?.testType) || !r.data || typeof r.data !== 'object') {
          invalidModule = r?.testType || 'unknown';
          break;
        }
        const evaluation = evaluateTestResult(r.testType, r.data, instrument, Boolean(r.isInService));
        evaluated.push({
          testType: r.testType,
          status: 'COMPLETED',
          result: evaluation.result,
          data: r.data,
          calculations: evaluation.calculations,
          remarks: evaluation.calculations?.summary || null,
        });
      }
      if (invalidModule) {
        reject(`Invalid test module '${invalidModule}': a known testType and its readings are required.`);
        continue;
      }

      // 4. Seal only when all six modules are present, exactly like finalize.
      //    Otherwise keep the readings as an unsealed in-progress session that
      //    the officer completes online, so no field work is lost.
      const completedTypes = new Set(evaluated.map((r) => r.testType));
      const isComplete = ALL_REQUIRED_TEST_TYPES.every((t) => completedTypes.has(t));
      const certificateNo = await generateCertificateNumber();
      const testDate = sessionData.testDate ? new Date(sessionData.testDate) : new Date();
      const recordedAt = Number.isNaN(testDate.getTime()) ? new Date() : testDate;

      try {
        const saved = await prisma.$transaction(async (tx) => {
          const created = await tx.testSession.create({
            data: {
              certificateNo,
              instrumentId: instrument.id,
              conductedById: officerId,
              status: 'IN_PROGRESS',
              remarks: sessionData.notes || sessionData.remarks || 'Synced from offline field queue',
              startedAt: recordedAt,
              testResults: evaluated.length ? { create: evaluated } : undefined,
            },
            include: { instrument: true, testResults: true },
          });

          let session = created;
          if (isComplete) {
            const overallResult = created.testResults.every((r) => r.result === 'PASS') ? 'PASS' : 'FAIL';
            const verificationSeal = generateVerificationSeal(
              buildSealInput({
                ...created,
                status: 'COMPLETED',
                overallResult,
                completedAt: recordedAt,
                conductedById: officerId,
              })
            );
            session = await tx.testSession.update({
              where: { id: created.id },
              data: {
                status: 'COMPLETED',
                overallResult,
                completedAt: recordedAt,
                sealedAt: recordedAt,
                verificationSeal,
              },
            });
          }

          await tx.auditLog.create({
            data: {
              userId: officerId,
              action: 'OFFLINE_SYNC_SESSION',
              entityType: 'TestSession',
              entityId: session.id,
              details: `IdempotencyKey: ${itemKey} | LocalId: ${localId} | ${certificateNo} | ${
                isComplete ? `sealed, ${session.overallResult}` : 'in progress, not sealed'
              }`,
              ipAddress: getClientIp(req) || '127.0.0.1',
            },
          });

          return session;
        });

        syncedCount++;
        processedKeys.push(itemKey);
        syncedSessionIds.push(saved.id);
        syncResults.push({
          localId,
          idempotencyKey: itemKey,
          sessionId: saved.id,
          certificateNo,
          status: 'SYNCED',
          sessionStatus: saved.status,
          overallResult: saved.overallResult || null,
          syncedAt: new Date().toISOString(),
        });
      } catch (dbErr) {
        reject('Database write failed during offline batch sync.');
      }
    }

    if (batchKey) {
      idempotencyStore.set(batchKey, {
        syncedCount: syncedSessionIds.length,
        sessionIds: syncedSessionIds,
        timestamp: new Date().toISOString(),
      });
    }

    const hasFailures = failedCount > 0;
    return res.status(hasFailures ? 207 : 200).json({
      success: !hasFailures,
      batchIdempotencyKey: batchKey,
      idempotentReplay: false,
      syncedCount,
      failedCount,
      duplicateCount,
      totalReceived: sessions.length,
      sessionIds: syncedSessionIds,
      results: syncResults,
      processedAt: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/sync/status
 */
function getSyncStatus(req, res) {
  return res.json({
    success: true,
    status: 'ONLINE',
    standards: 'OIML R-76-1:2006 / Indian Legal Metrology Act, 2009',
    idempotencyCacheSize: idempotencyStore.size,
    timestamp: new Date().toISOString(),
  });
}

/**
 * POST /api/sync/verify-keys
 */
async function verifyKeys(req, res, next) {
  try {
    const { keys = [] } = req.body;
    if (!Array.isArray(keys) || keys.length === 0) {
      return res.json({ success: true, existingKeys: [] });
    }

    const existingKeys = [];
    if (prisma && prisma.auditLog) {
      try {
        const auditLogs = await prisma.auditLog.findMany({
          where: {
            action: 'OFFLINE_SYNC_SESSION',
            OR: keys.map((k) => ({ details: { contains: k } })),
          },
          select: { details: true, entityId: true },
        });

        keys.forEach((k) => {
          const match = auditLogs.find((a) => a.details && a.details.includes(k));
          if (match) {
            existingKeys.push({
              key: k,
              sessionId: match.entityId,
            });
          }
        });
      } catch (err) {
        // Handled gracefully if DB query fails
      }
    }

    return res.json({
      success: true,
      totalChecked: keys.length,
      existingCount: existingKeys.length,
      existingKeys,
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  syncBatch,
  getSyncStatus,
  verifyKeys,
  idempotencyStore,
};
