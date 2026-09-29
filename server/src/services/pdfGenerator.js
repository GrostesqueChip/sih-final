/**
 * Unified PDF Generator Service
 * NAWI-ReportPro - OIML R-76 Verification Suite
 *
 * Exports official PDF Certificate and Technical Data Sheet generation services.
 */

const { generateCertificate, generateCertificatePDF, generateCertificatePdf } = require('./pdfCertificate');
const { generateDataSheet, generateDataSheetPDF, generateDataSheetPdf, generateDatasheetPdf } = require('./pdfDataSheet');

module.exports = {
  generateCertificate,
  generateCertificatePDF,
  generateCertificatePdf,
  generateDataSheet,
  generateDataSheetPDF,
  generateDataSheetPdf,
  generateDatasheetPdf,
};
