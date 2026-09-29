import { describe, it, expect } from 'vitest';
import telemetryService, {
  ZeroTracker,
  StabilityDetector,
} from '../../server/src/services/telemetrySimulator';

describe('Tier 1: Feature 6 - Zero-Tracking & Stable Weight Lock Engine', () => {
  it('F6-TC1: should track slow zero drift within OIML R-76 allowable rate (<= 0.5d/second)', () => {
    const d = 10; // 10 kg interval
    const tracker = new ZeroTracker({ d, maxRatePerSecond: 5.0, band: 0.5 }); // 0.5d band = 5 kg

    // Drift 1 kg (within 5 kg band) -> should track back towards zero
    const corrected = tracker.update(1.0, 0.2); // dt = 0.2s
    expect(Math.abs(corrected)).toBeLessThan(1.0);
  });

  it('F6-TC2: should NOT track loads exceeding the zero-tracking band (> 0.5d)', () => {
    const d = 10;
    const tracker = new ZeroTracker({ d, maxRatePerSecond: 5.0, band: 0.5 }); // band = 5 kg

    // Real applied load of 25 kg (> 5 kg band)
    const result = tracker.update(25.0, 0.2);
    // Must remain 25 kg (no zero suppression of real product/vehicle weight)
    expect(result).toBe(25.0);
  });

  it('F6-TC3: should detect motion and flag stability as false during weight transition', () => {
    const detector = new StabilityDetector({ threshold: 5.0, requiredStableCycles: 3 });

    // Rapidly changing weights (dynamic motion)
    expect(detector.update(100)).toBe(false);
    expect(detector.update(150)).toBe(false);
    expect(detector.update(210)).toBe(false);
    expect(detector.isStable).toBe(false);
  });

  it('F6-TC4: should lock stability (isStable=true) after consecutive readings within threshold window', () => {
    const detector = new StabilityDetector({ threshold: 2.0, requiredStableCycles: 3 });

    detector.update(500.0);
    detector.update(500.2);
    detector.update(500.1);
    const locked = detector.update(500.0);

    expect(locked).toBe(true);
    expect(detector.isStable).toBe(true);
  });

  it('F6-TC5: should trigger automated reading snapshot on stable lock trigger', () => {
    telemetryService.configure({
      actualInterval_d: 10,
      noiseLevel: 0,
      settlingCyclesRequired: 2,
    });
    telemetryService.setTargetWeight(20000);

    // Let the simulator settle to target
    for (let i = 0; i < 10; i++) {
      telemetryService.tick();
    }

    const reading = telemetryService.captureReading();
    expect(reading.isStable).toBe(true);
    expect(reading.weight).toBeCloseTo(20000, -1);
    expect(reading.capturedAt).toBeDefined();
  });
});
