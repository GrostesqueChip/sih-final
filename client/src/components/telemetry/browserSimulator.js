/**
 * In-browser weighing indicator simulator.
 *
 * Same physics and frame formats as server/src/services/telemetrySimulator.js
 * (settling, stability, zero tracking, zero/tare, healthy or faulty load cell,
 * Mettler-Toledo SICS / Avery Weigh-Tronix / Essae frames). Running it in the
 * page gives every officer their own indicator, and it keeps working when the
 * API runs as stateless serverless functions, where the load commands and a
 * server-side stream could land on different instances.
 * tests/tier1_feature/f5_browser_simulator_parity.test.js keeps the two in step.
 */

const PROTOCOLS = ['METTLER_SICS', 'AVERY_WEIGH_TRONIX', 'ESSAE'];

function asciiToHex(ascii) {
  let hex = '';
  for (let i = 0; i < ascii.length; i++) hex += ascii.charCodeAt(i).toString(16).padStart(2, '0');
  return hex.toUpperCase();
}

export class BrowserIndicatorSimulator {
  constructor(config = {}) {
    this.protocol = 'METTLER_SICS';
    this.unit = 'kg';
    this.maxCapacity = 100000;
    this.verificationInterval_e = 20;
    this.actualInterval_d = 20;

    this.targetWeight = 0;
    this.actualLoad = 0;
    this.zeroOffset = 0;
    this.tareWeight = 0;
    this.isTareActive = false;

    this.noiseLevel = 0.05;
    this.settlingSpeed = 0.45;
    this.stabilityThreshold = 0.5;
    this.settlingCyclesRequired = 2;
    this.stableCycleCount = 0;
    this.isStable = true;
    this.isOverload = false;
    this.condition = 'HEALTHY';

    this.zeroTrackingEnabled = true;
    this.zeroTrackingBand = 0.5;
    this.zeroTrackingRate = 0.1;

    this.tickRateMs = 150;
    this.timer = null;
    this.onFrame = null;
    this.configure(config);
  }

  /** Start emitting frames to `onFrame` at the indicator's output rate. */
  start(onFrame) {
    this.onFrame = onFrame;
    this.stop();
    this.timer = setInterval(() => {
      const frame = this.tick();
      if (this.onFrame) this.onFrame(frame);
    }, this.tickRateMs);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  configure(config = {}) {
    if (config.protocol && PROTOCOLS.includes(String(config.protocol).toUpperCase())) {
      this.protocol = String(config.protocol).toUpperCase();
    }
    if (config.unit) this.unit = config.unit;
    if (config.maxCapacity !== undefined && Number(config.maxCapacity) > 0) this.maxCapacity = Number(config.maxCapacity);
    if (config.verificationInterval_e !== undefined && Number(config.verificationInterval_e) > 0) {
      this.verificationInterval_e = Number(config.verificationInterval_e);
    }
    if (config.actualInterval_d !== undefined && Number(config.actualInterval_d) > 0) {
      this.actualInterval_d = Number(config.actualInterval_d);
    }
    if (config.noiseLevel !== undefined && Number(config.noiseLevel) >= 0) this.noiseLevel = Number(config.noiseLevel);
    if (config.targetWeight !== undefined) this.setTargetWeight(Number(config.targetWeight));
    if (config.zeroTrackingEnabled !== undefined) this.zeroTrackingEnabled = Boolean(config.zeroTrackingEnabled);
    if (config.condition && ['HEALTHY', 'FAULTY'].includes(String(config.condition).toUpperCase())) {
      this.condition = String(config.condition).toUpperCase();
    }
  }

  setTargetWeight(weight) {
    const numeric = Math.max(0, Number(weight) || 0);
    this.targetWeight = numeric;
    if (Math.abs(this.actualLoad - this.targetWeight) > this.actualInterval_d * 0.25) {
      this.isStable = false;
      this.stableCycleCount = 0;
    }
  }

  zero() {
    const effectiveLoad = this.actualLoad > 0 ? this.actualLoad : this.targetWeight;
    const currentGross = effectiveLoad - this.zeroOffset;
    if (Math.abs(currentGross) <= this.maxCapacity * 0.04 || this.actualLoad === 0 || this.targetWeight === 0) {
      this.zeroOffset = effectiveLoad;
      this.tareWeight = 0;
      this.isTareActive = false;
      this.isStable = true;
      this.stableCycleCount = this.settlingCyclesRequired;
      return true;
    }
    return false;
  }

  tare() {
    const effectiveLoad = this.actualLoad > 0 ? this.actualLoad : this.targetWeight;
    const currentGross = effectiveLoad - this.zeroOffset;
    if (currentGross > 0) {
      this.tareWeight = currentGross;
      this.isTareActive = true;
      return true;
    }
    if (this.isTareActive) {
      this.tareWeight = 0;
      this.isTareActive = false;
      return true;
    }
    return false;
  }

  /** Systematic error of the simulated load cell at a given applied load. */
  instrumentError(load) {
    const max = this.maxCapacity || 1;
    const e = this.verificationInterval_e || this.actualInterval_d || 1;
    const d = this.actualInterval_d || e;
    const ratio = Math.max(0, Math.min(1.2, load / max));
    if (this.condition === 'FAULTY') return ratio * 2.6 * e;
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
    return Number((Math.round(val / d) * d).toFixed(decimalPlaces));
  }

  encodeFrame({ protocol, weight, unit, isStable, isOverload, isNet, decimalPlaces }) {
    const formattedWeight = isOverload ? '------' : weight.toFixed(decimalPlaces);
    let ascii;
    switch (protocol) {
      case 'METTLER_SICS':
        ascii = isOverload ? 'S +\r\n' : `S ${isStable ? 'S' : 'D'} ${formattedWeight.padStart(10, ' ')} ${unit}\r\n`;
        break;
      case 'AVERY_WEIGH_TRONIX': {
        const absVal = Math.abs(weight).toFixed(decimalPlaces).padStart(8, '0');
        ascii = `\x02${weight >= 0 ? ' ' : '-'}${absVal} ${unit} ${isNet ? 'N' : 'G'} ${isStable ? 'S' : 'M'}\r\n`;
        break;
      }
      case 'ESSAE': {
        const absVal = Math.abs(weight).toFixed(decimalPlaces).padStart(6, '0');
        ascii = `\x02${absVal}${unit}${isStable ? 'S' : 'M'}\r`;
        break;
      }
      default:
        ascii = `S S ${formattedWeight} ${unit}\r\n`;
    }
    return { ascii, hex: asciiToHex(ascii) };
  }

  /** Advance one output cycle and return the frame the indicator sends. */
  tick() {
    const d = this.actualInterval_d || this.verificationInterval_e || 1;

    const delta = this.targetWeight - this.actualLoad;
    if (Math.abs(delta) > 0.00001) {
      this.actualLoad += delta * (this.noiseLevel === 0 ? 0.75 : this.settlingSpeed);
      if (Math.abs(this.targetWeight - this.actualLoad) < d * 0.25) this.actualLoad = this.targetWeight;
    }

    const grossUncorrected = this.actualLoad - this.zeroOffset;
    if (this.zeroTrackingEnabled && Math.abs(grossUncorrected) <= this.zeroTrackingBand * d && this.targetWeight === 0) {
      this.zeroOffset += grossUncorrected * this.zeroTrackingRate;
    }

    const randNorm = (Math.random() + Math.random() + Math.random() + Math.random() - 2) / 2;
    const grossWeight =
      this.actualLoad + this.instrumentError(this.actualLoad) - this.zeroOffset + randNorm * this.noiseLevel * d;
    const netWeight = this.isTareActive ? grossWeight - this.tareWeight : grossWeight;

    this.isOverload = grossWeight > this.maxCapacity + 9 * (this.verificationInterval_e || d);

    if (Math.abs(this.actualLoad - this.targetWeight) <= this.stabilityThreshold * d && !this.isOverload) {
      this.stableCycleCount++;
      if (this.stableCycleCount >= this.settlingCyclesRequired) this.isStable = true;
    } else {
      this.stableCycleCount = 0;
      this.isStable = false;
    }

    const decimalPlaces = this.getDecimalPlaces(d);
    const quantizedNet = this.isOverload ? null : this.quantize(netWeight, d, decimalPlaces);
    const quantizedGross = this.isOverload ? null : this.quantize(grossWeight, d, decimalPlaces);
    const isCenterOfZero = !this.isOverload && Math.abs(quantizedGross) <= 0.25 * d;

    const encoded = this.encodeFrame({
      protocol: this.protocol,
      weight: quantizedNet !== null ? quantizedNet : 999999,
      unit: this.unit,
      isStable: this.isStable,
      isOverload: this.isOverload,
      isNet: this.isTareActive,
      decimalPlaces,
    });

    return {
      protocol: this.protocol,
      weight: quantizedNet,
      grossWeight: quantizedGross,
      tareWeight: this.tareWeight,
      unit: this.unit,
      isStable: this.isStable,
      isZero: isCenterOfZero,
      isOverload: this.isOverload,
      isNet: this.isTareActive,
      rawAscii: encoded.ascii,
      rawHex: encoded.hex,
    };
  }
}
