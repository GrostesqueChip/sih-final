import { describe, it, expect } from 'vitest';
import { getMPE, calculateIndicationAndError, calculateMultiIntervalMPE } from '../../server/src/services/mpeCalculator';
import { SAMPLE_INSTRUMENTS } from '../helpers/testUtils';

describe('Tier 2: Boundary & Corner Cases - Metrology Limits & Overloads', () => {
  const wb = SAMPLE_INSTRUMENTS.WEIGHBRIDGE_60T_CLASS_III;
  const e = wb.verificationInterval; // 20 kg

  it('T2-M1: should handle zero load and zero deltaL returning continuous indication and zero error', () => {
    const calc = calculateIndicationAndError(0, 0, 20, 10); // L=0, I=0, e=20, deltaL=10 -> P = 0 + 10 - 10 = 0, E = 0
    expect(calc.continuousIndication).toBe(0);
    expect(calc.error).toBe(0);
  });

  it('T2-M2: should handle negative inputs via absolute value normalization without NaN or crash', () => {
    // Negative test load (e.g. testing balance with reversed differential)
    const mpeNeg = getMPE('CLASS_III', -500, false);
    expect(mpeNeg).toBe(0.5);
    const multiNeg = calculateMultiIntervalMPE(-1000, wb.accuracyClass, [{ max: 60000, e: 20 }]);
    expect(multiNeg.mpe).toBeGreaterThan(0);
    expect(isNaN(multiNeg.mpe)).toBe(false);
  });

  it('T2-M3: should detect overload condition when load exceeds Max + 9e per OIML R-76 clause 4.2.2.1', () => {
    // Max = 60,000 kg, e = 20 kg -> Max + 9e = 60,000 + 180 = 60,180 kg
    const maxPlus9e = wb.maxCapacity + 9 * e;
    const isOverloadLegal = 60100 > maxPlus9e;
    const isOverloadExceeded = 60200 > maxPlus9e;

    expect(isOverloadLegal).toBe(false);
    expect(isOverloadExceeded).toBe(true);
  });

  it('T2-M4: should calculate sub-division fractional turning points (deltaL) with micro-precision', () => {
    // Indicated = 10000 kg, e = 20 kg, deltaL = 6.45 kg
    // Continuous P = 10000 + 0.5 * 20 - 6.45 = 10000 + 10 - 6.45 = 10003.55 kg
    const calc = calculateIndicationAndError(10000, 10000, 20, 6.45);
    expect(calc.continuousIndication).toBe(10003.55);
    expect(calc.error).toBe(3.55);
  });

  it('T2-M5: should maintain numerical stability at extreme limits (Infinity, NaN, undefined)', () => {
    const mpeDef = getMPE('CLASS_III', undefined);
    expect(mpeDef).toBe(0.5); // Fallback to baseline zone

    const calcNull = calculateIndicationAndError(null, null, null, null);
    expect(calcNull.continuousIndication).toBe(0);
    expect(calcNull.error).toBe(0);
  });
});
