const crypto = require('crypto');
const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const prisma = require('../lib/prisma');
const { verifyToken, requireRole } = require('../middleware/auth');
const { createAuditLog, getClientIp } = require('../middleware/auditLog');
const { evaluateTestResult } = require('../services/mpeCalculator');
const { generateVerificationSeal, buildSealInput } = require('../services/cryptoSeal');
const {
  ALL_REQUIRED_TEST_TYPES,
  SESSION_TYPES,
  requiredTestTypesFor,
  isInServiceSession,
  isTypeEvaluation,
  generateCertificateNumber,
} = require('../lib/verificationRegister');

const VERIFICATION_TYPES = SESSION_TYPES;

/** 400 response when a module does not belong to the session's report type. */
function moduleNotApplicable(res, session, testType) {
  return res.status(400).json({
    success: false,
    message: isTypeEvaluation(session)
      ? `${testType} is not part of the type evaluation test set.`
      : `${testType} is a type-evaluation test (OIML R 76-1 A.5 / A.4.11). It is recorded in a Type Evaluation Test Report, not in a verification session.`,
  });
}

/**
 * GET /api/tests
 * List all test sessions with pagination and filters
 */
router.get('/', verifyToken, async (req, res, next) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const status = req.query.status;
    const instrumentId = req.query.instrumentId;
    const overallResult = req.query.overallResult;

    const where = {};
    if (status) where.status = status;
    if (instrumentId) where.instrumentId = instrumentId;
    if (overallResult) where.overallResult = overallResult;

    const [total, testSessions] = await Promise.all([
      prisma.testSession.count({ where }),
      prisma.testSession.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          instrument: {
            select: { id: true, name: true, model: true, serialNumber: true, accuracyClass: true, maxCapacity: true, unit: true },
          },
          conductedBy: {
            select: { id: true, name: true, email: true },
          },
          testResults: {
            select: { id: true, testType: true, status: true, result: true },
          },
        },
      }),
    ]);

    return res.json({
      success: true,
      data: testSessions,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/tests/:id
 * Get single test session by ID with all test results and instrument info
 */
router.get('/:id', verifyToken, async (req, res, next) => {
  try {
    const { id } = req.params;
    const session = await prisma.testSession.findUnique({
      where: { id },
      include: {
        instrument: true,
        conductedBy: {
          select: { id: true, name: true, email: true, role: true },
        },
        testResults: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!session) {
      return res.status(404).json({ success: false, message: 'Test session not found' });
    }

    return res.json({ success: true, data: session });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/tests
 * Create new test session for an instrument (INSPECTOR, ADMIN)
 */
router.post(
  '/',
  verifyToken,
  requireRole('ADMIN', 'INSPECTOR'),
  [
    body('instrumentId').notEmpty().withMessage('Instrument ID is required'),
    body('temperature').optional().isFloat(),
    body('humidity').optional().isFloat(),
    body('remarks').optional().isString(),
    body('ambientTemp').optional().isFloat(),
    body('relativeHumidity').optional().isFloat(),
    body('atmosphericPressure').optional().isFloat(),
    body('standardWeightsUsed').optional().isString(),
    body('verificationType').optional().isIn(VERIFICATION_TYPES),
  ],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, errors: errors.array() });
      }

      const { instrumentId, remarks } = req.body;
      const tempVal = req.body.temperature !== undefined ? req.body.temperature : req.body.ambientTemp;
      const humidityVal = req.body.humidity !== undefined ? req.body.humidity : req.body.relativeHumidity;

      const instrument = await prisma.instrument.findUnique({
        where: { id: instrumentId },
      });

      if (!instrument) {
        return res.status(404).json({ success: false, message: 'Instrument not found' });
      }

      const certificateNo = await generateCertificateNumber(req.body.verificationType || 'PERIODIC');

      const newSession = await prisma.testSession.create({
        data: {
          certificateNo,
          instrumentId,
          conductedById: req.user.id,
          status: 'IN_PROGRESS',
          temperature: tempVal !== undefined && tempVal !== null ? parseFloat(tempVal) : null,
          humidity: humidityVal !== undefined && humidityVal !== null ? parseFloat(humidityVal) : null,
          remarks: remarks || null,
          verificationType: req.body.verificationType || 'PERIODIC',
          atmosphericPressure:
            req.body.atmosphericPressure !== undefined && req.body.atmosphericPressure !== ''
              ? parseFloat(req.body.atmosphericPressure)
              : null,
          standardWeightsUsed: req.body.standardWeightsUsed || null,
          startedAt: new Date(),
        },
        include: {
          instrument: true,
          conductedBy: { select: { id: true, name: true, email: true } },
        },
      });

      const clientIp = getClientIp(req);
      await createAuditLog({
        userId: req.user.id,
        action: 'CREATE_TEST_SESSION',
        entityType: 'TestSession',
        entityId: newSession.id,
        details: `Created test session ${certificateNo} for instrument ${instrument.serialNumber}`,
        newValues: newSession,
        ipAddress: clientIp,
      });

      return res.status(201).json({
        success: true,
        message: 'Test session created successfully',
        data: newSession,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * PUT /api/tests/:id
 * Update test session metadata
 */
router.put(
  '/:id',
  verifyToken,
  requireRole('ADMIN', 'INSPECTOR'),
  [
    body('temperature').optional().isFloat(),
    body('humidity').optional().isFloat(),
    body('remarks').optional().isString(),
    body('status').optional().isIn(['PENDING', 'IN_PROGRESS']).withMessage(
      'Terminal status (COMPLETED/FAILED) can only be set via the /finalize endpoint, which computes the legal seal'
    ),
  ],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, errors: errors.array() });
      }

      const { id } = req.params;
      const oldSession = await prisma.testSession.findUnique({ where: { id } });

      if (!oldSession) {
        return res.status(404).json({ success: false, message: 'Test session not found' });
      }

      // IDOR protection: Non-admin inspectors cannot modify another officer's session
      if (req.user && req.user.role !== 'ADMIN' && oldSession.conductedById && oldSession.conductedById !== req.user.id) {
        return res.status(403).json({
          success: false,
          message: 'Access denied: You do not have permission to modify sessions belonging to other officers.',
        });
      }

      // Tamper protection: Legally finalized and completed sessions cannot be altered (FE-CRIT-04)
      if (oldSession.status === 'COMPLETED' && req.user && req.user.role !== 'ADMIN') {
        return res.status(403).json({
          success: false,
          message: 'Access denied: Legally finalized and sealed sessions cannot be modified.',
        });
      }

      const updateData = {};
      if (req.body.temperature !== undefined) updateData.temperature = parseFloat(req.body.temperature);
      if (req.body.humidity !== undefined) updateData.humidity = parseFloat(req.body.humidity);
      if (req.body.remarks !== undefined) updateData.remarks = req.body.remarks;
      if (req.body.status !== undefined) updateData.status = req.body.status;

      const updatedSession = await prisma.testSession.update({
        where: { id },
        data: updateData,
        include: { instrument: true },
      });

      const clientIp = getClientIp(req);
      await createAuditLog({
        userId: req.user.id,
        action: 'UPDATE_TEST_SESSION',
        entityType: 'TestSession',
        entityId: id,
        details: `Updated session metadata for ${updatedSession.certificateNo}`,
        oldValues: oldSession,
        newValues: updatedSession,
        ipAddress: clientIp,
      });

      return res.json({
        success: true,
        message: 'Test session updated successfully',
        data: updatedSession,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/tests/:sessionId/results
 * Save / execute test result for a specific test type
 */
router.post(
  '/:sessionId/results',
  verifyToken,
  requireRole('ADMIN', 'INSPECTOR'),
  [
    body('testType').isIn(ALL_REQUIRED_TEST_TYPES).withMessage('Valid testType is required'),
    body('data').notEmpty().withMessage('Measurement data object is required'),
    body('remarks').optional().isString(),
    body('isInService').optional().isBoolean(),
  ],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, errors: errors.array() });
      }

      const { sessionId } = req.params;
      const { testType, data, remarks } = req.body;
      // "Save progress" stores readings without evaluating or completing the
      // module, so a half-filled table can never count towards finalization.
      const isPartial = req.body.isPartial === true || req.body.status === 'IN_PROGRESS';

      const session = await prisma.testSession.findUnique({
        where: { id: sessionId },
        include: { instrument: true },
      });

      if (!session) {
        return res.status(404).json({ success: false, message: 'Test session not found' });
      }

      // IDOR protection: Non-admin inspectors cannot enter results for another officer's session
      if (req.user && req.user.role !== 'ADMIN' && session.conductedById && session.conductedById !== req.user.id) {
        return res.status(403).json({
          success: false,
          message: 'Access denied: You do not have permission to enter test results for sessions belonging to other officers.',
        });
      }

      // Tamper protection: Completed sessions cannot have new results entered (FE-CRIT-04)
      if (session.status === 'COMPLETED' && req.user && req.user.role !== 'ADMIN') {
        return res.status(403).json({
          success: false,
          message: 'Access denied: Cannot add test results to a legally finalized and sealed test session.',
        });
      }

      if (!requiredTestTypesFor(session).includes(testType)) {
        return moduleNotApplicable(res, session, testType);
      }

      // Surprise inspections of instruments in service are judged against 2x MPE
      // (OIML R-76 3.5.2); verification, re-verification and type evaluation
      // against 1x MPE. Always derived from the session type on the server —
      // any client-supplied isInService flag is ignored.
      const isInService = isInServiceSession(session);

      const evaluation = isPartial
        ? { result: null, calculations: null }
        : evaluateTestResult(testType, data, session.instrument, isInService);
      const moduleStatus = isPartial ? 'IN_PROGRESS' : 'COMPLETED';
      const moduleRemarks = remarks || evaluation.calculations?.summary || (isPartial ? 'Readings saved — module not yet completed.' : null);

      const testResult = await prisma.testResult.upsert({
        where: {
          testSessionId_testType: {
            testSessionId: sessionId,
            testType,
          },
        },
        update: {
          data,
          calculations: evaluation.calculations,
          status: moduleStatus,
          result: evaluation.result,
          remarks: moduleRemarks,
        },
        create: {
          testSessionId: sessionId,
          testType,
          status: moduleStatus,
          result: evaluation.result,
          data,
          calculations: evaluation.calculations,
          remarks: moduleRemarks,
        },
      });

      const clientIp = getClientIp(req);
      await createAuditLog({
        userId: req.user.id,
        action: 'ENTER_TEST_DATA',
        entityType: 'TestResult',
        entityId: testResult.id,
        details: isPartial
          ? `Saved partial readings for ${testType} on ${session.certificateNo} (module in progress)`
          : `Saved result for ${testType} on ${session.certificateNo} - Evaluation: ${evaluation.result}`,
        newValues: testResult,
        ipAddress: clientIp,
      });

      return res.status(201).json({
        success: true,
        message: isPartial ? `Progress saved for ${testType}` : `Test result for ${testType} evaluated and saved`,
        data: testResult,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * PUT /api/tests/:sessionId/results/:testType
 * Update existing test result
 */
router.put(
  '/:sessionId/results/:testType',
  verifyToken,
  requireRole('ADMIN', 'INSPECTOR'),
  [
    body('data').notEmpty().withMessage('Measurement data object is required'),
    body('remarks').optional().isString(),
    body('isInService').optional().isBoolean(),
  ],
  async (req, res, next) => {
    try {
      const { sessionId, testType } = req.params;
      const { data, remarks } = req.body;

      if (!ALL_REQUIRED_TEST_TYPES.includes(testType)) {
        return res.status(400).json({ success: false, message: `Invalid testType: ${testType}` });
      }

      const session = await prisma.testSession.findUnique({
        where: { id: sessionId },
        include: { instrument: true },
      });

      if (!session) {
        return res.status(404).json({ success: false, message: 'Test session not found' });
      }

      // IDOR protection: Non-admin inspectors cannot modify another officer's test results
      if (req.user && req.user.role !== 'ADMIN' && session.conductedById && session.conductedById !== req.user.id) {
        return res.status(403).json({
          success: false,
          message: 'Access denied: You do not have permission to modify test results for sessions belonging to other officers.',
        });
      }

      // Tamper protection: Completed sessions cannot have results altered (FE-CRIT-04)
      if (session.status === 'COMPLETED' && req.user && req.user.role !== 'ADMIN') {
        return res.status(403).json({
          success: false,
          message: 'Access denied: Cannot modify test results on a legally finalized and sealed test session.',
        });
      }

      if (!requiredTestTypesFor(session).includes(testType)) {
        return moduleNotApplicable(res, session, testType);
      }

      // In-service (2x MPE) derived from the session type, never from the client.
      const evaluation = evaluateTestResult(testType, data, session.instrument, isInServiceSession(session));

      const updated = await prisma.testResult.upsert({
        where: {
          testSessionId_testType: {
            testSessionId: sessionId,
            testType,
          },
        },
        update: {
          data,
          calculations: evaluation.calculations,
          status: 'COMPLETED',
          result: evaluation.result,
          remarks: remarks || evaluation.calculations.summary || null,
        },
        create: {
          testSessionId: sessionId,
          testType,
          status: 'COMPLETED',
          result: evaluation.result,
          data,
          calculations: evaluation.calculations,
          remarks: remarks || evaluation.calculations.summary || null,
        },
      });

      const clientIp = getClientIp(req);
      await createAuditLog({
        userId: req.user.id,
        action: 'MODIFY_TEST',
        entityType: 'TestResult',
        entityId: updated.id,
        details: `Modified test ${testType} on session ${session.certificateNo} - Result: ${evaluation.result}`,
        newValues: updated,
        ipAddress: clientIp,
      });

      return res.json({
        success: true,
        message: `Test result for ${testType} updated`,
        data: updated,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/tests/:sessionId/finalize
 * Finalize session, verify completion of all tests, evaluate overall PASS/FAIL
 */
router.post('/:sessionId/finalize', verifyToken, requireRole('ADMIN', 'INSPECTOR'), async (req, res, next) => {
  try {
    const { sessionId } = req.params;

    const session = await prisma.testSession.findUnique({
      where: { id: sessionId },
      include: {
        instrument: true,
        conductedBy: { select: { id: true, name: true, email: true, role: true } },
        testResults: true,
      },
    });

    if (!session) {
      return res.status(404).json({ success: false, message: 'Test session not found' });
    }

    // IDOR protection: Non-admin inspectors cannot finalize sessions belonging to other officers
    if (req.user && req.user.role !== 'ADMIN' && session.conductedById && session.conductedById !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Access denied: You do not have permission to finalize sessions belonging to other officers.',
      });
    }

    // Tamper protection: Session already finalized cannot be re-finalized
    if (session.status === 'COMPLETED' || session.status === 'FAILED') {
      return res.status(400).json({
        success: false,
        message: 'Test session has already been finalized and sealed.',
      });
    }

    // Only the modules that belong to this report type count: verification
    // sessions need the three verification tests, type evaluation needs all six.
    const requiredTypes = requiredTestTypesFor(session);
    const testResults = (session.testResults || []).filter((r) => requiredTypes.includes(r.testType));
    const completedTypes = new Set(testResults.filter((r) => r.status === 'COMPLETED').map((r) => r.testType));

    // Every required module must be completed (not merely started)
    const missingTests = requiredTypes.filter((t) => !completedTypes.has(t));
    if (missingTests.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot finalize session. Incomplete test modules: [${missingTests.join(', ')}]`,
        missingTests,
      });
    }

    // PASS only if every single test result is PASS. A failing session is still
    // finalized and sealed (status COMPLETED) — a rejection is a legal record too.
    const allPassed = testResults.every((r) => r.result === 'PASS');
    const overallResult = allPassed ? 'PASS' : 'FAIL';
    const finalStatus = 'COMPLETED';
    const finalizedAt = new Date();

    // SEC-CRIT-05: Compute the cryptographic HMAC digital seal at finalization
    // time. Built from the shared canonical seal-input helper so the signature is
    // byte-identical to the one recomputed by verifyCertificate — keyed to the
    // immutable officer id, not the display name (audit B-P0-2).
    const sealSignature = generateVerificationSeal(
      buildSealInput({
        ...session,
        testResults,
        status: finalStatus,
        overallResult,
        completedAt: finalizedAt,
        sealedAt: finalizedAt,
        conductedById: session.conductedById || session.conductedBy?.id,
      })
    );

    const finalizedSession = await prisma.testSession.update({
      where: { id: sessionId },
      data: {
        status: finalStatus,
        overallResult,
        completedAt: finalizedAt,
        verificationSeal: sealSignature,
        sealedAt: finalizedAt,
        ...(typeof req.body?.remarks === 'string' && req.body.remarks.trim() ? { remarks: req.body.remarks.trim() } : {}),
      },
      include: {
        instrument: true,
        conductedBy: { select: { id: true, name: true, email: true } },
        testResults: true,
      },
    });

    const clientIp = getClientIp(req);
    await createAuditLog({
      userId: req.user.id,
      action: 'FINALIZE_TEST_SESSION',
      entityType: 'TestSession',
      entityId: sessionId,
      details: `Finalized session ${session.certificateNo}. Overall Outcome: ${overallResult}`,
      newValues: finalizedSession,
      ipAddress: clientIp,
    });

    return res.json({
      success: true,
      message: `Session finalized successfully with result: ${overallResult}`,
      data: finalizedSession,
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
