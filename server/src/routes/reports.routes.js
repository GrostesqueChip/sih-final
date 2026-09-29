const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/auth');
const {
  getPublicSamples,
  getCertificatePdf,
  getDatasheetPdf,
  verifyCertificate,
} = require('../controllers/reports.controller');

let rateLimit;
try {
  rateLimit = require('express-rate-limit');
} catch (e) {
  rateLimit = null;
}

// Rate Limiting for Public QR Verification endpoint (prevent scrape / DoS attacks)
const verifyLimiter = rateLimit
  ? rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: process.env.NODE_ENV === 'production' ? 60 : 500, // 500 in dev/demo, 60 in prod
      standardHeaders: true,
      legacyHeaders: false,
      message: {
        valid: false,
        success: false,
        message: 'Too many verification requests. Please try again after 15 minutes.',
      },
      skip: (req) => process.env.NODE_ENV === 'test' && !req.headers['x-test-rate-limit'],
    })
  : (req, res, next) => next();

/**
 * Public Verification Route for QR and Market Inspection
 * GET /api/reports/verify/:certificateNo
 */
router.get('/verify/:certificateNo', verifyLimiter, verifyCertificate);
router.get('/public/samples', verifyLimiter, getPublicSamples);

/**
 * GET /api/reports/:sessionId/certificate
 * Generate and return official Verification Certificate PDF (Protected)
 */
router.get('/:sessionId/certificate', verifyToken, getCertificatePdf);
router.get('/certificate/:sessionId/pdf', verifyToken, getCertificatePdf);

/**
 * GET /api/reports/:sessionId/datasheet
 * Generate and return detailed Technical Data Sheet PDF (Protected)
 */
router.get('/:sessionId/datasheet', verifyToken, getDatasheetPdf);
router.get('/datasheet/:sessionId/pdf', verifyToken, getDatasheetPdf);

module.exports = router;
