const express = require('express');
const router = express.Router();
const batchController = require('../controllers/batch.controller');
const { verifyToken, requireRole } = require('../middleware/auth');

/**
 * Batch CSV / Excel Import & Export Routes
 * Protected with authenticateToken (verifyToken) and requireRole('ADMIN', 'INSPECTOR')
 */
router.use(verifyToken, requireRole('ADMIN', 'INSPECTOR'));

// Import 10-point weighbridge calibration CSV
router.post('/import-csv', batchController.uploadMiddleware, batchController.importCsv);

// Export complete test session to CSV
router.get('/export-csv/:sessionId', batchController.exportCsv);

// Download sample 10-point CSV calibration template
router.get('/template-csv', batchController.getTemplateCsv);

module.exports = router;
