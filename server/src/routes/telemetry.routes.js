const express = require('express');
const router = express.Router();
const telemetryController = require('../controllers/telemetry.controller');
const { verifyToken, requireRole } = require('../middleware/auth');

/**
 * RS-232 / USB Serial Telemetry Routes
 */

// SSE continuous telemetry stream & status
router.get('/stream', telemetryController.getTelemetryStream);
router.get('/status', telemetryController.getTelemetryStatus);

// Simulator configuration & dynamic indicator controls (SEC-CRIT-02)
// Protected with authenticateToken (verifyToken) and requireRole('ADMIN', 'INSPECTOR')
router.post('/config', verifyToken, requireRole('ADMIN', 'INSPECTOR'), telemetryController.configureSimulator);
router.post('/set-weight', verifyToken, requireRole('ADMIN', 'INSPECTOR'), telemetryController.setTargetWeight);
router.post('/zero', verifyToken, requireRole('ADMIN', 'INSPECTOR'), telemetryController.zeroIndicator);
router.post('/tare', verifyToken, requireRole('ADMIN', 'INSPECTOR'), telemetryController.tareIndicator);
router.post('/clear-tare', verifyToken, requireRole('ADMIN', 'INSPECTOR'), telemetryController.clearTare);

module.exports = router;
