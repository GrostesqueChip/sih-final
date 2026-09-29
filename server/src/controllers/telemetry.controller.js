/**
 * Controller for RS-232 / USB Serial Telemetry Simulator & Streaming Endpoints
 */

const telemetrySimulator = require('../services/telemetrySimulator');

/**
 * GET /api/telemetry/stream
 * Server-Sent Events (SSE) endpoint for continuous telemetry streaming
 */
exports.getTelemetryStream = (req, res, next) => {
  try {
    const { protocol, targetWeight, noise, unit, maxCapacity, e, d, condition } = req.query;

    // Apply optional query parameters to configure the stream
    telemetrySimulator.configure({
      protocol: protocol || undefined,
      targetWeight: targetWeight !== undefined ? Number(targetWeight) : undefined,
      noiseLevel: noise !== undefined ? Number(noise) : undefined,
      unit: unit || undefined,
      maxCapacity: maxCapacity !== undefined ? Number(maxCapacity) : undefined,
      verificationInterval_e: e !== undefined ? Number(e) : undefined,
      actualInterval_d: d !== undefined ? Number(d) : undefined,
      condition: condition || undefined,
    });

    // Set SSE Headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Disable proxy buffering (Nginx)

    // Initial comment to establish connection
    res.write(': connected to NAWI-ReportPro RS-232 Telemetry Stream\n\n');

    // Register client
    telemetrySimulator.subscribe(res);

    // Handle client disconnection
    req.on('close', () => {
      telemetrySimulator.unsubscribe(res);
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/telemetry/status
 * Get current indicator state snapshot
 */
exports.getTelemetryStatus = (req, res, next) => {
  try {
    const status = telemetrySimulator.getStatus();
    return res.json({
      success: true,
      data: status,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/telemetry/config
 * Update simulator configuration (protocol, unit, capacity, intervals, noise)
 */
exports.configureSimulator = (req, res, next) => {
  try {
    const { protocol, unit, maxCapacity, verificationInterval_e, actualInterval_d, noiseLevel, targetWeight, zeroTrackingEnabled, condition } = req.body;
    
    const status = telemetrySimulator.configure({
      protocol,
      unit,
      maxCapacity,
      verificationInterval_e,
      actualInterval_d,
      noiseLevel,
      targetWeight,
      zeroTrackingEnabled,
      condition,
    });

    return res.json({
      success: true,
      message: 'Simulator configured successfully',
      data: status,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/telemetry/set-weight
 * Set target applied load on the simulated scale
 */
exports.setTargetWeight = (req, res, next) => {
  try {
    const { weight } = req.body;
    if (weight === undefined || isNaN(Number(weight))) {
      return res.status(400).json({
        success: false,
        message: 'Invalid weight value provided.',
      });
    }

    const status = telemetrySimulator.setTargetWeight(Number(weight));
    return res.json({
      success: true,
      message: `Target weight set to ${Number(weight)} ${status.unit}`,
      data: status,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/telemetry/zero
 * Zero the simulated weighing indicator (Z command)
 */
exports.zeroIndicator = (req, res, next) => {
  try {
    const result = telemetrySimulator.zero();
    return res.json({
      success: result.success,
      message: result.message,
      data: telemetrySimulator.getStatus(),
    });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/telemetry/tare
 * Tare the simulated indicator (T command)
 */
exports.tareIndicator = (req, res, next) => {
  try {
    const { tareValue } = req.body || {};
    const result = telemetrySimulator.tare(tareValue);
    return res.json({
      success: result.success,
      message: result.message,
      data: telemetrySimulator.getStatus(),
    });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/telemetry/clear-tare
 * Clear active tare
 */
exports.clearTare = (req, res, next) => {
  try {
    const result = telemetrySimulator.clearTare();
    return res.json({
      success: result.success,
      message: result.message,
      data: telemetrySimulator.getStatus(),
    });
  } catch (err) {
    next(err);
  }
};
