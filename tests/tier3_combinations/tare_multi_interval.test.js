import { describe, it, expect } from 'vitest';
import { calculateMultiIntervalMPE, calculateTareCapacities, validateHysteresis } from '../../server/src/services/mpeCalculator';
import { SAMPLE_INSTRUMENTS } from '../helpers/testUtils';

describe('Tier 3: Cross-Feature - Tare & Multi-Interval Joint Metrology', () => {
  const dualScale = SAMPLE_INSTRUMENTS.DUAL_INTERVAL_RETAIL_CLASS_III;
  // Dual interval: Range 1 (0..15kg, e1=0.005kg), Range 2 (15..30kg, e2=0.010kg)

  it('T3-TM1: should shift multi-interval range boundary from Range 1 to Range 2 due to subtractive tare', () => {
    // Tare = 10 kg. Net load = 7 kg -> Gross load = 17 kg (> 15 kg Max 1)
    // Scale must evaluate with e2 = 0.010 kg in Range 2
    const result = calculateMultiIntervalMPE(7.0, dualScale.accuracyClass, dualScale.ranges, false, { value: 10.0, type: 'SUBTRACTIVE' });
    expect(result.currentRangeIndex).toBe(1);
    expect(result.currentE).toBe(0.010);
    expect(result.grossLoad).toBe(17.0);
    expect(result.netLoad).toBe(7.0);
  });

  it('T3-TM2: should calculate additive tare expanding gross capacity while preserving net multi-interval range steps', () => {
    // Additive tare = 5 kg on dual-scale. Gross Max = 30 + 5 = 35 kg.
    const tareInfo = calculateTareCapacities(30, { value: 5.0, type: 'ADDITIVE' });
    expect(tareInfo.maxGross).toBe(35.0);
    expect(tareInfo.maxNet).toBe(30.0);
  });

  it('T3-TM3: should evaluate hysteresis across multi-interval ranges with active tare applied', () => {
    const tare = { value: 5.0, type: 'SUBTRACTIVE' }; // 5 kg tare
    const inc = [
      { appliedLoad: 5.0, indicatedValue: 5.0, deltaL: 0.0025 },  // Gross = 10kg (Range 1, e1=0.005)
      { appliedLoad: 15.0, indicatedValue: 15.0, deltaL: 0.005 }, // Gross = 20kg (Range 2, e2=0.010)
    ];
    const dec = [
      { appliedLoad: 15.0, indicatedValue: 15.005, deltaL: 0.005 }, // Hys = 0.005 kg <= MPE (0.010 kg)
      { appliedLoad: 5.0, indicatedValue: 5.002, deltaL: 0.0025 },   // Hys = 0.002 kg <= MPE (0.005 kg)
    ];

    const hysResult = validateHysteresis(inc, dec, dualScale, false, dualScale.ranges, tare);
    expect(hysResult.overallPass).toBe(true);
    expect(hysResult.evaluations).toHaveLength(2);
    expect(hysResult.evaluations[0].currentRangeIndex).toBe(0);
    expect(hysResult.evaluations[1].currentRangeIndex).toBe(1);
  });

  it('T3-TM4: should evaluate in-service 2x MPE multiplier under multi-interval tare configuration', () => {
    // Net load 12 kg, Tare 8 kg -> Gross 20 kg (Range 2, 2000e2 -> Zone 2 initial MPE = 1.0 * 0.010 = 0.010 kg)
    // In-service MPE = 2 * 0.010 = 0.020 kg
    const resInitial = calculateMultiIntervalMPE(12.0, dualScale.accuracyClass, dualScale.ranges, false, { value: 8.0, type: 'SUBTRACTIVE' });
    const resInService = calculateMultiIntervalMPE(12.0, dualScale.accuracyClass, dualScale.ranges, true, { value: 8.0, type: 'SUBTRACTIVE' });

    expect(resInitial.mpe).toBeCloseTo(0.010, 6);
    expect(resInService.mpe).toBeCloseTo(0.020, 6);
  });

  it('T3-TM5: should maintain exact net load range constraints when tare equals Range 1 Max', () => {
    // Tare = 15 kg (exact Max_1). Any positive net load immediately falls into Range 2!
    const res = calculateMultiIntervalMPE(1.0, dualScale.accuracyClass, dualScale.ranges, false, { value: 15.0, type: 'SUBTRACTIVE' });
    expect(res.currentRangeIndex).toBe(1);
    expect(res.currentE).toBe(0.010);
    expect(res.grossLoad).toBe(16.0);
  });
});
