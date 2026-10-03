const crypto = require('crypto');
const prisma = require('../lib/prisma');
const { generateCertificatePdf, generateDatasheetPdf } = require('../services/pdfGenerator');
const { generateTypeEvaluationDocx } = require('../services/docxTypeEvaluationReport');
const { createAuditLog, getClientIp } = require('../middleware/auditLog');
const { generateVerificationSeal, verifySealSignature, computeErrorCurvePoints, buildSealInput } = require('../services/cryptoSeal');
const { getMPE } = require('../services/mpeCalculator');

/** Attachment metadata for a report annex (never the file bytes). */
async function listAttachments(sessionId) {
  const list = await prisma.sessionAttachment.findMany({ where: { testSessionId: sessionId }, orderBy: { createdAt: 'asc' } });
  return list.map((a) => ({ fileName: a.fileName, mimeType: a.mimeType, size: a.size, sha256: a.sha256, caption: a.caption || '' }));
}

/**
 * GET /api/reports/:sessionId/certificate
 * Generate and return official Verification Certificate PDF (authenticated)
 */
async function getCertificatePdf(req, res, next) {
  try {
    const { sessionId } = req.params;

    const session = await prisma.testSession.findUnique({
      where: { id: sessionId },
      include: {
        instrument: true,
        conductedBy: { select: { id: true, name: true, email: true, role: true, designation: true, district: true } },
        testResults: true,
      },
    });

    if (!session) {
      return res.status(404).json({ success: false, message: 'Test session not found' });
    }

    // Integrity gate (audit B-P0-3): a certificate PDF is an official legal
    // document. Never emit one for a session that has not been finalized and
    // cryptographically sealed — otherwise an IN_PROGRESS session yields an
    // official-looking certificate with a fabricated officer and verdict.
    const certIsSealed =
      Boolean(session.verificationSeal) &&
      (session.status === 'COMPLETED' || session.status === 'FAILED');
    if (!certIsSealed) {
      return res.status(409).json({
        success: false,
        message:
          'Certificate is not available: this verification session has not been finalized and sealed yet.',
        status: session.status,
      });
    }

    session.attachments = await listAttachments(sessionId);
    const pdfBuffer = await generateCertificatePdf(session);

    if (req.user) {
      const clientIp = getClientIp(req);
      await createAuditLog({
        userId: req.user.id,
        action: 'GENERATE_CERTIFICATE_PDF',
        entityType: 'TestSession',
        entityId: sessionId,
        details: `Generated official certificate PDF for ${session.certificateNo}`,
        ipAddress: clientIp,
      });
    }

    res.setHeader('Content-Type', 'application/pdf');
    const docName = session.verificationType === 'TYPE_EVALUATION' ? 'TypeEvaluationReport' : 'Certificate';
    res.setHeader('Content-Disposition', `inline; filename="${docName}_${session.certificateNo}.pdf"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    return res.send(pdfBuffer);
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/reports/:sessionId/docx
 * Editable Word copy of the Type Evaluation Test Report (authenticated).
 * Same gates as the PDF: only for a finalized, sealed TYPE_EVALUATION session.
 */
async function getReportDocx(req, res, next) {
  try {
    const { sessionId } = req.params;

    const session = await prisma.testSession.findUnique({
      where: { id: sessionId },
      include: {
        instrument: true,
        conductedBy: { select: { id: true, name: true, email: true, role: true, designation: true, district: true } },
        testResults: true,
      },
    });

    if (!session) {
      return res.status(404).json({ success: false, message: 'Test session not found' });
    }
    if (session.verificationType !== 'TYPE_EVALUATION') {
      return res.status(400).json({ success: false, message: 'Word export is available for type evaluation test reports only.' });
    }
    const isSealed = Boolean(session.verificationSeal) && (session.status === 'COMPLETED' || session.status === 'FAILED');
    if (!isSealed) {
      return res.status(409).json({
        success: false,
        message: 'Report is not available: this session has not been finalized and sealed yet.',
        status: session.status,
      });
    }

    session.attachments = await listAttachments(sessionId);
    const buffer = await generateTypeEvaluationDocx(session);

    if (req.user) {
      await createAuditLog({
        userId: req.user.id,
        action: 'GENERATE_REPORT_DOCX',
        entityType: 'TestSession',
        entityId: sessionId,
        details: `Generated editable Word copy of type evaluation report ${session.certificateNo}`,
        ipAddress: getClientIp(req),
      });
    }

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="TypeEvaluationReport_${session.certificateNo}.docx"`);
    res.setHeader('Content-Length', buffer.length);
    return res.send(buffer);
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/reports/:sessionId/datasheet
 * Generate and return detailed Technical Data Sheet PDF (authenticated)
 */
async function getDatasheetPdf(req, res, next) {
  try {
    const { sessionId } = req.params;

    const session = await prisma.testSession.findUnique({
      where: { id: sessionId },
      include: {
        instrument: true,
        conductedBy: { select: { id: true, name: true, email: true, role: true, designation: true, district: true } },
        testResults: true,
      },
    });

    if (!session) {
      return res.status(404).json({ success: false, message: 'Test session not found' });
    }

    // Integrity gate (audit B-P0-3): the technical datasheet is issued only for a
    // finalized, sealed session — never for an in-progress or unsealed one.
    const sheetIsSealed =
      Boolean(session.verificationSeal) &&
      (session.status === 'COMPLETED' || session.status === 'FAILED');
    if (!sheetIsSealed) {
      return res.status(409).json({
        success: false,
        message:
          'Data sheet is not available: this verification session has not been finalized and sealed yet.',
        status: session.status,
      });
    }

    const pdfBuffer = await generateDatasheetPdf(session);

    if (req.user) {
      const clientIp = getClientIp(req);
      await createAuditLog({
        userId: req.user.id,
        action: 'GENERATE_DATASHEET_PDF',
        entityType: 'TestSession',
        entityId: sessionId,
        details: `Generated technical data sheet PDF for ${session.certificateNo}`,
        ipAddress: clientIp,
      });
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="Datasheet_${session.certificateNo}.pdf"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    return res.send(pdfBuffer);
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/reports/verify/:certificateNo
 * Public endpoint for QR verification lookup conforming to OIML R-76 and Legal Metrology standard
 */
async function verifyCertificate(req, res, next) {
  try {
    const { certificateNo } = req.params;

    let session = null;
    try {
      if (prisma && prisma.testSession) {
        session = await prisma.testSession.findUnique({
          where: { certificateNo },
          include: {
            instrument: true,
            conductedBy: { select: { id: true, name: true, email: true, role: true, designation: true, district: true } },
            testResults: true,
          },
        });
      }
    } catch (dbErr) {
      session = null;
    }

    if (!session) {
      return res.status(404).json({
        valid: false,
        success: false,
        message: `Certificate with reference '${certificateNo}' was not found in the national registry.`,
      });
    }

    const inst = session.instrument || {};
    const e = Number(inst.verificationInterval || 1);
    const accClass = inst.accuracyClass || 'CLASS_III';

    // Extract or compute error curve data from WEIGHING_PERFORMANCE test results
    const weighingTest = session.testResults?.find(
      (t) => t.testType === 'WEIGHING_PERFORMANCE' || t.testType === 'WEIGHING'
    );

    let errorCurveData = [];
    if (weighingTest && weighingTest.data && Array.isArray(weighingTest.data.points)) {
      errorCurveData = computeErrorCurvePoints(weighingTest.data.points, inst, false);
    } else {
      // Default standard envelope points
      errorCurveData = computeErrorCurvePoints([], inst, false);
    }

    // Determine verification and expiry dates
    const rawDate = session.completedAt || session.sealedAt || session.createdAt || new Date();
    const verificationDate = rawDate instanceof Date ? rawDate.toISOString() : new Date(rawDate).toISOString();

    const vDateObj = new Date(verificationDate);
    const expDateObj = new Date(vDateObj);
    expDateObj.setFullYear(vDateObj.getFullYear() + 1);
    const expiryDate = expDateObj.toISOString();
    // A type evaluation test report has no trade-validity window.
    const isTypeEvalReport = session.verificationType === 'TYPE_EVALUATION';
    const isExpired = !isTypeEvalReport && Date.now() > expDateObj.getTime();

    // --- Three ORTHOGONAL axes, never conflated into one boolean (audit B-P0-1) ---

    // 1) Metrological verdict — the recorded PASS/FAIL outcome. Never fabricated,
    //    never defaulted to PASS. Derived from the stored result, falling back to
    //    the sealed lifecycle status only when overallResult is genuinely absent.
    let verdict = session.overallResult || null;
    if (!verdict) {
      if (session.status === 'COMPLETED') verdict = 'PASS';
      else if (session.status === 'FAILED') verdict = 'FAIL';
      else verdict = 'UNKNOWN';
    }

    // 2) Authenticity — is the stored seal genuine and untampered? Recompute the
    //    seal from the canonical input (the identical builder used at finalize
    //    time) and compare in constant time. An unsealed session is not authentic.
    const storedSeal = session.verificationSeal || null;
    const sealInput = buildSealInput(session);
    const computedSeal = generateVerificationSeal(sealInput);
    let sealVerified = false;
    if (storedSeal) {
      try {
        const storedBuf = Buffer.from(String(storedSeal).toLowerCase(), 'hex');
        const computedBuf = Buffer.from(computedSeal.toLowerCase(), 'hex');
        sealVerified =
          storedBuf.length === 32 &&
          computedBuf.length === 32 &&
          crypto.timingSafeEqual(storedBuf, computedBuf);
      } catch (err) {
        sealVerified = false;
      }
    }

    // Optional incoming seal from a QR scan (?seal= / x-verify-seal) must also
    // match the seal on record, otherwise the scanned artifact is not authentic.
    const incomingSeal = req.query.seal || req.headers['x-verify-seal'];
    if (incomingSeal && storedSeal) {
      try {
        const incomingBuf = Buffer.from(String(incomingSeal).toLowerCase(), 'hex');
        const expectedBuf = Buffer.from(String(storedSeal).toLowerCase(), 'hex');
        if (incomingBuf.length !== 32 || !crypto.timingSafeEqual(incomingBuf, expectedBuf)) {
          sealVerified = false;
        }
      } catch (err) {
        sealVerified = false;
      }
    }

    const authentic = Boolean(storedSeal) && sealVerified;

    // 3) Validity window — within the statutory 1-year period.
    const withinValidity = !isExpired;

    // Resolved single-word status for the badge (collapses the axes for display).
    // A genuine seal on a FAIL reads REJECTED (authentic), NOT TAMPERED.
    let finalStatus;
    if (storedSeal && !sealVerified) finalStatus = 'TAMPERED';
    else if (verdict === 'FAIL') finalStatus = 'REJECTED';
    else if (verdict === 'PASS' && isExpired) finalStatus = 'EXPIRED';
    else if (verdict === 'PASS') finalStatus = 'VERIFIED_LEGAL';
    else finalStatus = 'UNKNOWN';

    // Legacy "valid" = safe for commercial/trade use right now (authentic PASS,
    // in validity). An authentically-sealed FAIL is authentic:true but valid:false.
    // A type evaluation report is never an approval for trade.
    const isOfficiallyValid = !isTypeEvalReport && authentic && verdict === 'PASS' && withinValidity;

    // Officer identity is NEVER fabricated. Absent officer -> null (UI shows "—").
    const officerName = session.conductedBy?.name || null;
    const officerDesignation = officerName
      ? session.conductedBy?.role === 'ADMIN'
        ? 'Controller of Legal Metrology'
        : 'Inspector of Legal Metrology'
      : null;

    const responsePayload = {
      valid: isOfficiallyValid,
      authentic,
      verdict,
      withinValidity,
      success: true,
      certificateNumber: session.certificateNo,
      certificateNo: session.certificateNo,
      instrument: {
        id: inst.id,
        name: inst.name || null,
        model: inst.model || null,
        serialNumber: inst.serialNumber || null,
        accuracyClass: inst.accuracyClass || null,
        maxCapacity: inst.maxCapacity != null ? Number(inst.maxCapacity) : null,
        minCapacity: inst.minCapacity != null ? Number(inst.minCapacity) : null,
        verificationInterval: inst.verificationInterval != null ? Number(inst.verificationInterval) : null,
        actualInterval:
          inst.actualInterval != null
            ? Number(inst.actualInterval)
            : inst.verificationInterval != null
            ? Number(inst.verificationInterval)
            : null,
        unit: inst.unit || 'kg',
        type: inst.type || null,
        location: inst.location || null,
        district: inst.district || null,
        ownerName: inst.ownerName || null,
        ranges: inst.ranges || inst.multiIntervalRanges || null,
      },
      verificationDate,
      expiryDate: verdict === 'PASS' && !isTypeEvalReport ? expiryDate : null,
      verificationType: session.verificationType || null,
      reportType: isTypeEvalReport ? 'TYPE_EVALUATION_REPORT' : 'VERIFICATION_CERTIFICATE',
      status: finalStatus,
      overallResult: verdict,
      verificationOfficer: officerName
        ? {
            name: officerName,
            designation: session.conductedBy?.designation || officerDesignation,
            jurisdiction: inst.location || null,
            email: session.conductedBy?.email || null,
          }
        : null,
      conductedBy: officerName,
      sealSignature: storedSeal,
      // SHA-256 of the sealed readings, so anyone holding the data sheet can
      // recompute the seal input without access to the database.
      readingsDigest: sealInput.readingsDigest,
      identityDigest: sealInput.identityDigest,
      sealedAt: session.sealedAt || session.completedAt || null,
      sealVerified,
      errorCurveData,
      testResults: session.testResults,
      verifiedAt: new Date().toISOString(),
    };

    return res.json(responsePayload);
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/reports/public/samples
 * A few recently sealed certificate numbers (one approved, one rejected) so a
 * visitor to the public portal can try verification without a QR code.
 */
async function getPublicSamples(req, res, next) {
  try {
    const recent = await prisma.testSession.findMany({
      where: { status: 'COMPLETED' },
      orderBy: { completedAt: 'desc' },
      take: 40,
    });
    const pick = (v) => recent.filter((s) => s.overallResult === v).slice(0, 2).map((s) => ({ certificateNo: s.certificateNo, result: s.overallResult }));
    return res.json({ success: true, data: [...pick('PASS'), ...pick('FAIL')] });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getPublicSamples,
  getCertificatePdf,
  getDatasheetPdf,
  getReportDocx,
  verifyCertificate,
};
