import { describe, it, expect } from 'vitest';
import {
  computeRepeatabilityUncertainty,
  computeResolutionUncertainty,
  computeStandardWeightsUncertainty,
  computeEccentricityUncertainty,
  computeTemperatureUncertainty,
  computeExpandedUncertainty,
  computeCalibrationUncertaintyCurve,
} from '../../server/src/services/uncertaintyCalculator';
import { SAMPLE_INSTRUMENTS } from '../helpers/testUtils';

describe('Tier 1: Feature 3 - ISO GUM / EURAMET cg-18 Measurement Uncertainty Engine', () => {
  const wb = SAMPLE_INSTRUMENTS.WEIGHBRIDGE_60T_CLASS_III;

  it('F3-TC1: should compute Type A repeatability standard uncertainty (u_rep) from sample standard deviation', () => {
    const readings = [20000, 20020, 20000, 19980, 20020, 20000]; // mean = 20003.33, s ≈ 15.05 kg
    const res = computeRepeatabilityUncertainty(readings, 20, 6);
    expect(res.nReadings).toBe(6);
    expect(res.degreesOfFreedom).toBe(5);
    expect(res.stdDev).toBeGreaterThan(10);
    expect(res.u_rep).toBe(res.stdDev);
  });

  it('F3-TC2: should calculate digital resolution standard uncertainty (u_res = d / (2 * sqrt(3)))', () => {
    const d = 20; // 20 kg
    const res = computeResolutionUncertainty(d);
    // 20 / (2 * sqrt(3)) = 20 / 3.4641 = 5.7735 kg
    expect(res.u_res).toBeCloseTo(5.7735, 4);
    expect(res.degreesOfFreedom).toBe(Infinity);
  });

  it('F3-TC3: should compute standard weights uncertainty conforming to EURAMET cg-18 1/3 MPE criterion', () => {
    const load = 20000; // 20,000 kg / 20 = 1000e -> Zone 2 MPE = 1.0 * 20 = 20 kg
    // MPE_std <= 20 / 3 = 6.6667 kg -> u_std = 6.6667 / sqrt(3) = 3.849 kg
    const res = computeStandardWeightsUncertainty(load, 'CLASS_III', { e: 20 });
    expect(res.standardWeightMpe).toBeCloseTo(20 / 3, 4);
    expect(res.u_std).toBeCloseTo(20 / (3 * Math.sqrt(3)), 4);
  });

  it('F3-TC4: should compute combined standard uncertainty (u_c) and expanded uncertainty (U = k * u_c, k=2)', () => {
    const budget = computeExpandedUncertainty(10.0, 20, 30000, 'CLASS_III', {
      eccError: 15.0,
      tempVariation: 5.0,
      e: 20,
    });

    expect(budget.coverageFactor).toBe(2);
    expect(budget.components.repeatability).toBe(10.0);
    expect(budget.components.resolution).toBeCloseTo(20 / (2 * Math.sqrt(3)), 4);
    expect(budget.combinedStandardUncertainty).toBeGreaterThan(10.0);
    expect(budget.expandedUncertainty).toBeCloseTo(budget.combinedStandardUncertainty * 2, 4);
    expect(budget.expandedUncertaintyFormatted).toContain('±');
  });

  it('F3-TC5: should generate a complete multi-point calibration uncertainty curve across the span', () => {
    const loadPoints = [0, 10000, 20000, 30000, 40000, 50000, 60000];
    const curve = computeCalibrationUncertaintyCurve(loadPoints, wb, {
      REPEATABILITY: { calculations: { maxStdDev: 8.5 } },
      ECCENTRICITY: { calculations: { maxDifferenceFromCenter: 12.0 } },
    });

    expect(curve).toHaveLength(7);
    expect(curve[0].load).toBe(0);
    expect(curve[6].load).toBe(60000);
    curve.forEach((pt) => {
      expect(pt.expandedUncertainty).toBeGreaterThan(0);
      expect(pt.coverageFactor).toBe(2);
      expect(pt.components).toBeDefined();
    });
  });
});
