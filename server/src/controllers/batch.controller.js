/**
 * Controller for Batch CSV / Excel Import & Export Endpoints
 */

const multer = require('multer');
const prisma = require('../lib/prisma');
const {
  parseCsvText,
  processWeighbridgeCalibrationCsv,
  generateSampleCsvTemplate,
  exportSessionToCsv,
} = require('../services/batchImportExport');

// Configure in-memory storage for CSV upload
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    if (
      file.mimetype === 'text/csv' ||
      file.mimetype === 'text/plain' ||
      file.mimetype === 'application/vnd.ms-excel' ||
      file.originalname.match(/\.(csv|txt|tsv)$/i)
    ) {
      cb(null, true);
    } else {
      cb(new Error('Only CSV, TSV, or TXT tabular files are supported.'));
    }
  },
});

exports.uploadMiddleware = upload.single('file');

/**
 * POST /api/batch/import-csv
 * Import and evaluate 10-point weighbridge calibration series from CSV
 */
exports.importCsv = async (req, res, next) => {
  try {
    let csvContent = '';

    // 1. Extract CSV string from multipart file upload or JSON body
    if (req.file) {
      csvContent = req.file.buffer.toString('utf-8');
    } else if (req.body && req.body.csv) {
      csvContent = String(req.body.csv);
    } else if (typeof req.body === 'string' && req.body.trim().length > 0) {
      csvContent = req.body;
    } else {
      return res.status(400).json({
        success: false,
        message: 'No CSV file or data provided in request. Please upload a file with field "file" or provide "csv" string in body.',
      });
    }

    const sessionId = req.body.sessionId || req.query.sessionId;
    const instrumentId = req.body.instrumentId || req.query.instrumentId;
    const isInService = req.body.isInService === true || req.body.isInService === 'true' || req.query.isInService === 'true';

    // 2. Fetch or resolve instrument metrological parameters
    let instrument = null;
    let session = null;

    if (sessionId) {
      session = await prisma.testSession.findUnique({
        where: { id: sessionId },
        include: { instrument: true },
      });
      if (session) {
        instrument = session.instrument;
      }
    }

    if (!instrument && instrumentId) {
      instrument = await prisma.instrument.findUnique({
        where: { id: instrumentId },
      });
    }

    // Fallback or explicit override params
    if (!instrument) {
      instrument = {
        model: req.body.model || 'Electronic Weighbridge',
        accuracyClass: req.body.accuracyClass || 'CLASS_III',
        maxCapacity: Number(req.body.maxCapacity) || 100000,
        verificationInterval: Number(req.body.verificationInterval || req.body.e) || 20,
        actualInterval: Number(req.body.actualInterval || req.body.d) || 20,
        unit: req.body.unit || 'kg',
      };
    }

    // 3. Parse CSV content
    const { headers, rows } = parseCsvText(csvContent);

    // 4. Process and calculate metrological errors & MPE limits
    const result = processWeighbridgeCalibrationCsv(rows, instrument, isInService);

    // 5. Optionally save result to TestSession in database
    const saveToDatabase = req.body.saveToDatabase === true || req.body.saveToDatabase === 'true';
    if (session && saveToDatabase) {
      // IDOR protection: Non-admin inspectors cannot save results into another officer's session
      if (req.user && req.user.role !== 'ADMIN' && session.conductedById && session.conductedById !== req.user.id) {
        return res.status(403).json({
          success: false,
          message: 'Access denied: You do not have permission to modify sessions belonging to other officers.',
        });
      }

      // Tamper protection: Completed sessions cannot be modified (FE-CRIT-04)
      if (session.status === 'COMPLETED' && req.user && req.user.role !== 'ADMIN') {
        return res.status(403).json({
          success: false,
          message: 'Access denied: Legally finalized and sealed sessions cannot be modified.',
        });
      }

      const existingResult = await prisma.testResult.findUnique({
        where: {
          testSessionId_testType: {
            testSessionId: session.id,
            testType: 'WEIGHING_PERFORMANCE',
          },
        },
      });

      const resultStatus = result.overallPass ? 'COMPLETED' : 'FAILED';
      const resultPassStr = result.overallPass ? 'PASS' : 'FAIL';

      if (existingResult) {
        await prisma.testResult.update({
          where: { id: existingResult.id },
          data: {
            status: resultStatus,
            result: resultPassStr,
            data: result.testResultPayload,
            calculations: {
              totalPoints: result.totalPoints,
              passedPoints: result.passedPoints,
              failedPoints: result.failedPoints,
              maxCorrectedError: result.maxCorrectedError,
              maxHysteresis: result.maxHysteresis,
              overallPass: result.overallPass,
            },
          },
        });
      } else {
        await prisma.testResult.create({
          data: {
            testSessionId: session.id,
            testType: 'WEIGHING_PERFORMANCE',
            status: resultStatus,
            result: resultPassStr,
            data: result.testResultPayload,
            calculations: {
              totalPoints: result.totalPoints,
              passedPoints: result.passedPoints,
              failedPoints: result.failedPoints,
              maxCorrectedError: result.maxCorrectedError,
              maxHysteresis: result.maxHysteresis,
              overallPass: result.overallPass,
            },
          },
        });
      }

      // Update session status
      await prisma.testSession.update({
        where: { id: session.id },
        data: { status: 'IN_PROGRESS' },
      });
    }

    return res.json({
      success: true,
      message: `Successfully processed ${result.totalPoints} calibration points (${result.passedPoints} compliant, ${result.failedPoints} non-compliant).`,
      data: {
        ...result,
        instrument: {
          id: instrument.id,
          model: instrument.model,
          accuracyClass: instrument.accuracyClass,
          maxCapacity: instrument.maxCapacity,
          verificationInterval: instrument.verificationInterval || instrument.verificationScaleInterval_e,
          unit: instrument.unit,
        },
        sessionId: session?.id || null,
        savedToDatabase: Boolean(session && saveToDatabase),
      },
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message || 'Error processing calibration CSV.',
    });
  }
};

/**
 * GET /api/batch/export-csv/:sessionId
 * Export full test session data as downloadable CSV
 */
exports.exportCsv = async (req, res, next) => {
  try {
    const { sessionId } = req.params;
    if (!sessionId) {
      return res.status(400).json({
        success: false,
        message: 'Session ID is required for CSV export.',
      });
    }

    // IDOR protection: Non-admin inspectors cannot export sessions belonging to other officers
    if (req.user && req.user.role !== 'ADMIN') {
      let session = null;
      try {
        if (prisma && prisma.testSession) {
          session = await prisma.testSession.findUnique({
            where: { id: sessionId },
            select: { id: true, conductedById: true },
          });
        }
      } catch (err) {
        session = null;
      }

      if (session && session.conductedById && session.conductedById !== req.user.id) {
        return res.status(403).json({
          success: false,
          message: 'Access denied: You do not have permission to export sessions belonging to other officers.',
        });
      }
    }

    const { filename, csvContent } = await exportSessionToCsv(sessionId);

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send(csvContent);
  } catch (error) {
    return res.status(404).json({
      success: false,
      message: error.message || 'Error generating session CSV export.',
    });
  }
};

/**
 * GET /api/batch/template-csv
 * Download a prefilled 10-point calibration CSV template for an instrument
 */
exports.getTemplateCsv = async (req, res, next) => {
  try {
    const { instrumentId, maxCapacity, e, unit, model } = req.query;
    let instrument = null;

    if (instrumentId) {
      instrument = await prisma.instrument.findUnique({
        where: { id: instrumentId },
      });
    }

    if (!instrument) {
      instrument = {
        model: model || 'Electronic Weighbridge',
        maxCapacity: Number(maxCapacity) || 100000,
        verificationInterval: Number(e) || 20,
        unit: unit || 'kg',
      };
    }

    const templateContent = generateSampleCsvTemplate(instrument);
    const filename = `NAWI_Weighbridge_10Point_Template_${instrument.maxCapacity}${instrument.unit}.csv`;

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send(templateContent);
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || 'Error generating CSV template.',
    });
  }
};
