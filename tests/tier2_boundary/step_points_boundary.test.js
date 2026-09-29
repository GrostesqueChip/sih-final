import { describe, it, expect } from 'vitest';
import { getMPE, calculateMultiIntervalMPE } from '../../server/src/services/mpeCalculator';
import { SAMPLE_INSTRUMENTS } from '../helpers/testUtils';

describe('Tier 2: Boundary & Corner Cases - Exact Step Points & Zone Boundaries', () => {
  const wb = SAMPLE_INSTRUMENTS.WEIGHBRIDGE_60T_CLASS_III;
  const dual = SAMPLE_INSTRUMENTS.DUAL_INTERVAL_RETAIL_CLASS_III;

  it('T2-B1: should evaluate exact boundary 500e in Class III at exactly 0.5e, and (500e + epsilon) at 1.0e', () => {
    const e = 20; // 20 kg
    const loadAt500e = 500 * e; // 10,000 kg
    const loadAbove500e = 10000 + 0.001;

    const mpeAt500e = getMPE('CLASS_III', loadAt500e / e, false);
    const mpeAbove500e = getMPE('CLASS_III', loadAbove500e / e, false);

    expect(mpeAt500e).toBe(0.5);
    expect(mpeAbove500e).toBe(1.0);
  });

  it('T2-B2: should evaluate exact boundary 2000e in Class III at exactly 1.0e, and (2000e + epsilon) at 1.5e', () => {
    const e = 20;
    const loadAt2000e = 2000 * e; // 40,000 kg
    const loadAbove2000e = 40000 + 0.001;

    const mpeAt2000e = getMPE('CLASS_III', loadAt2000e / e, false);
    const mpeAbove2000e = getMPE('CLASS_III', loadAbove2000e / e, false);

    expect(mpeAt2000e).toBe(1.0);
    expect(mpeAbove2000e).toBe(1.5);
  });

  it('T2-B3: should evaluate Class II exact step points (5000e at 0.5e, 20000e at 1.0e, 100000e at 1.5e)', () => {
    const e = 0.01; // Class II
    expect(getMPE('CLASS_II', 5000, false)).toBe(0.5);
    expect(getMPE('CLASS_II', 5000.1, false)).toBe(1.0);
    expect(getMPE('CLASS_II', 20000, false)).toBe(1.0);
    expect(getMPE('CLASS_II', 20000.1, false)).toBe(1.5);
  });

  it('T2-B4: should evaluate Class I exact step points (50000e at 0.5e, 200000e at 1.0e, above at 1.5e)', () => {
    expect(getMPE('CLASS_I', 50000, false)).toBe(0.5);
    expect(getMPE('CLASS_I', 50000.1, false)).toBe(1.0);
    expect(getMPE('CLASS_I', 200000, false)).toBe(1.0);
    expect(getMPE('CLASS_I', 200000.1, false)).toBe(1.5);
  });

  it('T2-B5: should shift step points correctly when tare equals exact interval boundary', () => {
    // Dual scale: Range 1 (0..15kg, e1=0.005kg), Range 2 (15..30kg, e2=0.010kg)
    // Tare = 2.5 kg (500 e1 exact). Net = 2.5 kg -> Gross = 5.0 kg (1000 e1 -> Zone 2 MPE)
    const result = calculateMultiIntervalMPE(2.5, dual.accuracyClass, dual.ranges, false, { value: 2.5, type: 'SUBTRACTIVE' });
    expect(result.grossLoad).toBe(5.0);
    expect(result.mpeInE).toBe(1.0);
    expect(result.mpe).toBeCloseTo(0.005, 6);
  });
});
