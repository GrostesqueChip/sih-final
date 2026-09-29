/**
 * RS-232 / USB Serial Telemetry Simulator
 * Conforming to OIML R-76 digital weighing indicator telemetry protocols:
 * 1. Mettler Toledo SICS (Standard Interface Command Set)
 * 2. Avery Weigh-Tronix (Continuous ASCII Stream)
 * 3. Essae (Teraoka / Essae Weighbridge Indicator Protocol)
 */

class ZeroTracker {
  constructor({ d = 1, maxRatePerSecond = 0.5, band = 0.5 } = {}) {
    this.d = d;
    this.maxRatePerSecond = maxRatePerSecond;
    this.band = band * d;
    this.offset = 0;
  }

  update(reading, dt = 0.2) {
    if (Math.abs(reading) <= this.band) {
      const maxPull = this.maxRatePerSecond * dt;
      const pull = Math.sign(reading) * Math.min(Math.abs(reading), maxPull);
      this.offset += pull;
      return Number((reading - this.offset).toFixed(6));
    }
    return reading;
  }
}

class StabilityDetector {
  constructor({ threshold = 0.5, requiredStableCycles = 3 } = {}) {
    this.threshold = threshold;
    this.requiredStableCycles = requiredStableCycles;
    this.history = [];
    this.isStable = false;
  }

  update(val) {
    this.history.push(val);
    if (this.history.length > this.requiredStableCycles) {
      this.history.shift();
    }
    if (this.history.length < this.requiredStableCycles) {
      this.isStable = false;
      return false;
    }
    const maxVal = Math.max(...this.history);
    const minVal = Math.min(...this.history);
    this.isStable = (maxVal - minVal) <= this.threshold;
    return this.isStable;
  }
}

function parseSICSFrame(ascii) {
  if (!ascii || typeof ascii !== 'string') {
    return { protocol: 'METTLER_SICS', weight: 0, unit: 'kg', isStable: false, isZero: false, isOverload: false };
  }
  const clean = ascii.trim();
  const isOverload = clean.includes('S +') || clean.includes('S -');
  const isStable = clean.startsWith('S S') || clean.startsWith('S_S');
  const isZero = clean.includes('Z A');

  const match = clean.match(/([-+]?[0-9]*\.?[0-9]+)\s*([a-zA-Z]+)?/);
  const weight = match ? parseFloat(match[1]) : 0;
  const unit = (match && match[2]) ? match[2] : 'kg';

  return {
    protocol: 'METTLER_SICS',
    weight: isNaN(weight) ? 0 : weight,
    unit,
    isStable: isStable || (clean.startsWith('S') && !clean.startsWith('S D') && !isOverload),
    isZero,
    isOverload,
    rawAscii: ascii,
  };
}

function parseAveryFrame(ascii) {
  if (!ascii || typeof ascii !== 'string') {
    return { protocol: 'AVERY_WEIGH_TRONIX', weight: 0, unit: 'kg', isStable: false, tareStatus: 'GROSS' };
  }
  const clean = ascii.replace(/[\x02\x03\r\n]/g, '').trim();
  const match = clean.match(/([-+]?[0-9]*\.?[0-9]+)\s*([a-zA-Z]+)?\s*([GN])?\s*([SMD])?/i);
  const weight = match ? parseFloat(match[1]) : 0;
  const unit = match && match[2] ? match[2] : 'kg';
  const tareStatus = match && match[3] === 'N' ? 'NET' : 'GROSS';
  const isStable = match ? (match[4] === 'S' || !match[4]) : true;

  return {
    protocol: 'AVERY_WEIGH_TRONIX',
    weight: isNaN(weight) ? 0 : weight,
    unit,
    tareStatus,
    isStable,
    rawAscii: ascii,
  };
}

function parseEssaeFrame(ascii) {
  if (!ascii || typeof ascii !== 'string') {
    return { protocol: 'ESSAE', weight: 0, unit: 'kg', isStable: false };
  }
  const clean = ascii.replace(/[\x02\x03\r\n]/g, '').trim();
  const isStable = clean.toUpperCase().endsWith('S');
  const withoutStatus = clean.replace(/[SMD]$/i, '');
  const match = withoutStatus.match(/([-+]?[0-9]*\.?[0-9]+)\s*([a-zA-Z]+)?/);
  const weight = match ? parseFloat(match[1]) : 0;
  const unit = match && match[2] ? match[2] : 'kg';

  return {
    protocol: 'ESSAE',
    weight: isNaN(weight) ? 0 : weight,
    unit,
    isStable,
    rawAscii: ascii,
  };
}

function parseTelemetryFrame(rawString, protocol = 'METTLER_SICS') {
  const norm = String(protocol || 'METTLER_SICS').toUpperCase();
  if (norm.includes('AVERY')) return parseAveryFrame(rawString);
  if (norm.includes('ESSAE')) return parseEssaeFrame(rawString);
  return parseSICSFrame(rawString);
}

class TelemetrySimulator {
  constructor() {
    this.protocol = 'METTLER_SICS'; // 'METTLER_SICS' | 'AVERY_WEIGH_TRONIX' | 'ESSAE'
    this.unit = 'kg';
    this.maxCapacity = 100000; // default 100t weighbridge
    this.verificationInterval_e = 20; // 20 kg
    this.actualInterval_d = 20; // 20 kg
    
    // Physical state
    this.targetWeight = 0;
    this.actualLoad = 0; // physical load applied to load cells
    this.rawIndication = 0; // load cell output before zero/tare
    this.zeroOffset = 0; // zero reference
    this.tareWeight = 0; // tare value
    this.isTareActive = false;
    
    // Stability & Noise simulation
    this.noiseLevel = 0.05; // noise multiplier relative to interval d
    this.settlingSpeed = 0.45; // 0..1 rate of approach to target
    this.stabilityThreshold = 0.5; // fraction of d within which weight is considered stable
    this.settlingCyclesRequired = 2; // consecutive cycles in tolerance to lock stability
    this.stableCycleCount = 0;
    this.isStable = true;
    this.isOverload = false;
    
    // Simulated metrological condition of the instrument under test.
    // HEALTHY: small span error well inside MPE.  FAULTY: over-reads ~2.6e at Max.
    this.condition = 'HEALTHY';

    // Dynamic Zero-Tracking (OIML R-76 clause 4.5.3: <= 0.5 d/second)
    this.zeroTrackingEnabled = true;
    this.zeroTrackingBand = 0.5; // in units of d
    this.zeroTrackingRate = 0.1; // rate of zero pull per tick

    // Subscribers for SSE stream
    this.listeners = new Set();
    this.timer = null;
    this.tickRateMs = 150; // ~6.6 Hz telemetry stream
    this.startStreamingLoop();
  }

  subscribe(res) {
    this.listeners.add(res);
  }

  unsubscribe(res) {
    this.listeners.delete(res);
  }

  startStreamingLoop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = setInterval(() => {
      this.tick();
    }, this.tickRateMs);
  }

  stopStreamingLoop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  configure(config = {}) {
    if (config.protocol && ['METTLER_SICS', 'AVERY_WEIGH_TRONIX', 'ESSAE'].includes(config.protocol.toUpperCase())) {
      this.protocol = config.protocol.toUpperCase();
    }
    if (config.unit) this.unit = config.unit;
    if (config.maxCapacity !== undefined && Number(config.maxCapacity) > 0) {
      this.maxCapacity = Number(config.maxCapacity);
    }
    if (config.verificationInterval_e !== undefined && Number(config.verificationInterval_e) > 0) {
      this.verificationInterval_e = Number(config.verificationInterval_e);
    }
    if (config.actualInterval_d !== undefined && Number(config.actualInterval_d) > 0) {
      this.actualInterval_d = Number(config.actualInterval_d);
    }
    if (config.noiseLevel !== undefined && Number(config.noiseLevel) >= 0) {
      this.noiseLevel = Number(config.noiseLevel);
    }
    if (config.targetWeight !== undefined) {
      this.setTargetWeight(Number(config.targetWeight));
    }
    if (config.zeroTrackingEnabled !== undefined) {
      this.zeroTrackingEnabled = Boolean(config.zeroTrackingEnabled);
    }
    if (config.condition && ['HEALTHY', 'FAULTY'].includes(String(config.condition).toUpperCase())) {
      this.condition = String(config.condition).toUpperCase();
    }
    return this.getStatus();
  }

  setTargetWeight(weight) {
    const numeric = Math.max(0, Number(weight) || 0);
    this.targetWeight = numeric;
    if (Math.abs(this.actualLoad - this.targetWeight) > this.actualInterval_d * 0.25) {
      this.isStable = false;
      this.stableCycleCount = 0;
    }
    if (numeric !== 0 && Math.abs(numeric - this.zeroOffset) > (this.actualInterval_d * 0.5)) {
      this._isZero = false;
    }
    return this.getStatus();
  }

  get isZero() {
    if (this._isZero) return true;
    const d = this.actualInterval_d || this.verificationInterval_e || 1;
    const gross = (this.actualLoad > 0 ? this.actualLoad : this.targetWeight) - this.zeroOffset;
    return Math.abs(gross) <= (0.5 * d);
  }

  zero() {
    const effectiveLoad = this.actualLoad > 0 ? this.actualLoad : this.targetWeight;
    const currentGross = effectiveLoad - this.zeroOffset;
    const maxZeroRange = this.maxCapacity * 0.04;
    
    if (Math.abs(currentGross) <= maxZeroRange || this.actualLoad === 0 || this.targetWeight === 0) {
      this.zeroOffset = effectiveLoad;
      this._isZero = true;
      this.tareWeight = 0;
      this.isTareActive = false;
      this.isStable = true;
      this.stableCycleCount = this.settlingCyclesRequired;
      return { success: true, message: 'Indicator zeroed successfully (Z A).' };
    }
    return { 
      success: false, 
      message: `Zero setting out of range.` 
    };
  }

  tare(specifiedTare = null) {
    if (specifiedTare !== null && Number(specifiedTare) >= 0) {
      this.tareWeight = Number(specifiedTare);
      this.isTareActive = this.tareWeight > 0;
      return { success: true, message: `Preset Tare set to ${this.tareWeight} ${this.unit}` };
    }
    
    const effectiveLoad = this.actualLoad > 0 ? this.actualLoad : this.targetWeight;
    const currentGross = effectiveLoad - this.zeroOffset;
    if (currentGross > 0) {
      this.tareWeight = currentGross;
      this.isTareActive = true;
      return { success: true, message: `Tare captured at ${this.tareWeight.toFixed(3)} ${this.unit}` };
    } else if (this.isTareActive) {
      this.tareWeight = 0;
      this.isTareActive = false;
      return { success: true, message: 'Tare cleared' };
    }
    return { success: false, message: 'Cannot tare negative or zero weight' };
  }

  clearTare() {
    this.tareWeight = 0;
    this.isTareActive = false;
    return { success: true, message: 'Tare cleared' };
  }

  /** Systematic error of the simulated load cell at a given applied load. */
  instrumentError(load) {
    const max = this.maxCapacity || 1;
    const e = this.verificationInterval_e || this.actualInterval_d || 1;
    const d = this.actualInterval_d || e;
    const ratio = Math.max(0, Math.min(1.2, load / max));
    if (this.condition === 'FAULTY') return ratio * 2.6 * e;
    // Healthy: exact up to ~60 % of Max, then about one division high.
    return d < e ? ratio * 0.6 * e : ratio >= 0.75 ? d * 0.9 : 0;
  }

  getDecimalPlaces(d) {
    if (d < 0.0001) return 5;
    if (d < 0.001) return 4;
    if (d < 0.01) return 3;
    if (d < 0.1) return 2;
    if (d < 1) return 1;
    return 0;
  }

  quantize(val, d, decimalPlaces) {
    if (val === null || isNaN(val)) return 0;
    const steps = Math.round(val / d);
    return Number((steps * d).toFixed(decimalPlaces));
  }

  encodeFrame({ protocol, weight, grossWeight, tareWeight, unit, isStable, isZero, isOverload, isNet, decimalPlaces }) {
    const formattedWeight = isOverload ? '------' : weight.toFixed(decimalPlaces);
    
    let ascii = '';
    let hex = '';

    switch (protocol) {
      case 'METTLER_SICS': {
        if (isOverload) {
          ascii = 'S +\r\n';
        } else {
          const statusChar = isStable ? 'S' : 'D';
          const paddedWeight = formattedWeight.padStart(10, ' ');
          ascii = `S ${statusChar} ${paddedWeight} ${unit}\r\n`;
        }
        break;
      }
      case 'AVERY_WEIGH_TRONIX': {
        const pol = weight >= 0 ? ' ' : '-';
        const absVal = Math.abs(weight).toFixed(decimalPlaces).padStart(8, '0');
        const gn = isNet ? 'N' : 'G';
        const st = isStable ? 'S' : 'M';
        ascii = `\x02${pol}${absVal} ${unit} ${gn} ${st}\r\n`;
        break;
      }
      case 'ESSAE': {
        const st = isStable ? 'S' : 'M';
        const absVal = Math.abs(weight).toFixed(decimalPlaces).padStart(6, '0');
        ascii = `\x02${absVal}${unit}${st}\r`;
        break;
      }
      default:
        ascii = `S S ${formattedWeight} ${unit}\r\n`;
    }

    hex = Buffer.from(ascii, 'ascii').toString('hex').toUpperCase();
    return { ascii, hex };
  }

  tick() {
    const d = this.actualInterval_d || this.verificationInterval_e || 1;
    
    const delta = this.targetWeight - this.actualLoad;
    if (Math.abs(delta) > 0.00001) {
      const speed = this.noiseLevel === 0 ? 0.75 : this.settlingSpeed;
      this.actualLoad += delta * speed;
      if (Math.abs(this.targetWeight - this.actualLoad) < (d * 0.25)) {
        this.actualLoad = this.targetWeight;
      }
    }

    const grossUncorrected = this.actualLoad - this.zeroOffset;
    const isNearCenterOfZero = Math.abs(grossUncorrected) <= (this.zeroTrackingBand * d);
    
    if (this.zeroTrackingEnabled && isNearCenterOfZero && this.targetWeight === 0) {
      this.zeroOffset += grossUncorrected * this.zeroTrackingRate;
    }

    const randNorm = ((Math.random() + Math.random() + Math.random() + Math.random() - 2) / 2);
    const noiseMagnitude = this.noiseLevel * d;
    const currentNoise = randNorm * noiseMagnitude;

    const grossWeight = this.actualLoad + this.instrumentError(this.actualLoad) - this.zeroOffset + currentNoise;
    const netWeight = this.isTareActive ? (grossWeight - this.tareWeight) : grossWeight;

    const overloadLimit = this.maxCapacity + (9 * (this.verificationInterval_e || d));
    this.isOverload = grossWeight > overloadLimit;

    const diffFromTarget = Math.abs(this.actualLoad - this.targetWeight);
    if (diffFromTarget <= (this.stabilityThreshold * d) && !this.isOverload) {
      this.stableCycleCount++;
      if (this.stableCycleCount >= this.settlingCyclesRequired) {
        this.isStable = true;
      }
    } else {
      this.stableCycleCount = 0;
      this.isStable = false;
    }

    const decimalPlaces = this.getDecimalPlaces(d);
    const quantizedNet = this.isOverload ? null : this.quantize(netWeight, d, decimalPlaces);
    const quantizedGross = this.isOverload ? null : this.quantize(grossWeight, d, decimalPlaces);
    const isCenterOfZero = !this.isOverload && Math.abs(quantizedGross) <= (0.25 * d);

    const frame = this.encodeFrame({
      protocol: this.protocol,
      weight: quantizedNet !== null ? quantizedNet : 999999,
      grossWeight: quantizedGross !== null ? quantizedGross : 999999,
      tareWeight: this.tareWeight,
      unit: this.unit,
      isStable: this.isStable,
      isZero: isCenterOfZero,
      isOverload: this.isOverload,
      isNet: this.isTareActive,
      decimalPlaces,
    });

    if (this.listeners.size > 0) {
      const payload = {
        protocol: this.protocol,
        weight: quantizedNet,
        grossWeight: quantizedGross,
        tareWeight: this.tareWeight,
        unit: this.unit,
        isStable: this.isStable,
        isZero: isCenterOfZero,
        isOverload: this.isOverload,
        isNet: this.isTareActive,
        rawAscii: frame.ascii,
        rawHex: frame.hex,
        timestamp: new Date().toISOString(),
      };

      const dataStr = `data: ${JSON.stringify(payload)}\n\n`;
      for (const listener of this.listeners) {
        try {
          listener.write(dataStr);
        } catch (err) {
          this.listeners.delete(listener);
        }
      }
    }
  }

  generateFrame() {
    const status = this.getStatus();
    return {
      protocol: this.protocol,
      rawAscii: status.rawAscii,
      rawHex: status.rawHex,
      weight: status.netWeight ?? status.grossWeight ?? 0,
      unit: this.unit,
      isStable: status.isStable,
      isZero: status.isZero,
      isOverload: status.isOverload,
      timestamp: new Date().toISOString(),
    };
  }

  captureReading() {
    const status = this.getStatus();
    return {
      weight: status.netWeight ?? status.grossWeight ?? this.targetWeight,
      grossWeight: status.grossWeight ?? this.targetWeight,
      unit: this.unit,
      isStable: this.isStable,
      capturedAt: new Date().toISOString(),
    };
  }

  getStatus() {
    const d = this.actualInterval_d || this.verificationInterval_e || 1;
    const decimalPlaces = this.getDecimalPlaces(d);
    const gross = (this.actualLoad > 0 ? this.actualLoad : this.targetWeight) - this.zeroOffset;
    const net = this.isTareActive ? (gross - this.tareWeight) : gross;
    const quantizedNet = this.isOverload ? null : this.quantize(net, d, decimalPlaces);
    const quantizedGross = this.isOverload ? null : this.quantize(gross, d, decimalPlaces);

    const frame = this.encodeFrame({
      protocol: this.protocol,
      weight: quantizedNet || 0,
      grossWeight: quantizedGross || 0,
      tareWeight: this.tareWeight,
      unit: this.unit,
      isStable: this.isStable,
      isZero: quantizedGross === 0,
      isOverload: this.isOverload,
      isNet: this.isTareActive,
      decimalPlaces,
    });

    return {
      protocol: this.protocol,
      targetWeight: this.targetWeight,
      actualLoad: this.actualLoad,
      grossWeight: quantizedGross,
      netWeight: quantizedNet,
      tareWeight: this.tareWeight,
      isTareActive: this.isTareActive,
      isStable: this.isStable,
      isZero: quantizedGross === 0,
      isOverload: this.isOverload,
      unit: this.unit,
      rawAscii: frame.ascii,
      rawHex: frame.hex,
      condition: this.condition,
      activeSubscribers: this.listeners.size,
    };
  }
}

const telemetrySimulator = new TelemetrySimulator();

module.exports = telemetrySimulator;
module.exports.TelemetrySimulator = TelemetrySimulator;
module.exports.ZeroTracker = ZeroTracker;
module.exports.StabilityDetector = StabilityDetector;
module.exports.parseSICSFrame = parseSICSFrame;
module.exports.parseAveryFrame = parseAveryFrame;
module.exports.parseEssaeFrame = parseEssaeFrame;
module.exports.parseTelemetryFrame = parseTelemetryFrame;
