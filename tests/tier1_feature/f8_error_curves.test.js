import { describe, it, expect } from 'vitest';
import { getMPE, calculateIndicationAndError } from '../../server/src/services/mpeCalculator';
import { SAMPLE_INSTRUMENTS } from '../helpers/testUtils';

describe('Tier 1: Feature 8 - Dynamic Error Envelope Curve & Visual Tolerance Analytics', () => {
  const wb = SAMPLE_INSTRUMENTS.WEIGHBRIDGE_60T_CLASS_III;
  const e = wb.verificationInterval; // 20 kg

  function buildErrorEnvelopeCurve(points, instrument, isInService = false) {
    const e = instrument.verificationInterval || 1;
    const accClass = instrument.accuracyClass || 'CLASS_III';
    
    return points.map(pt => {
      const load = Number(pt.appliedLoad || 0);
      const mpeE = getMPE(accClass, load / e, isInService);
      const mpeMass = mpeE * e;
      const calc = calculateIndicationAndError(load, pt.indicatedValue, e, pt.deltaL);
      const error = calc.error;
      const isPass = Math.abs(error) <= mpeMass + 1e-9;

      return {
        load,
        indicatedValue: pt.indicatedValue,
        continuousIndication: calc.continuousIndication,
        error,
        mpeUpper: Number(mpeMass.toFixed(6)),
        mpeLower: Number((-mpeMass).toFixed(6)),
        isPass,
        isIncreasing: pt.isIncreasing !== false,
      };
    });
  }

  it('F8-TC1: should generate stepped ±MPE tolerance envelope limits (0.5e, 1.0e, 1.5e) across load span', () => {
    const testPoints = [
      { appliedLoad: 0, indicatedValue: 0, deltaL: 10 },
      { appliedLoad: 10000, indicatedValue: 10000, deltaL: 10 }, // 500e -> ±10 kg (0.5e)
      { appliedLoad: 40000, indicatedValue: 40000, deltaL: 10 }, // 2000e -> ±20 kg (1.0e)
      { appliedLoad: 60000, indicatedValue: 60000, deltaL: 10 }, // 3000e -> ±30 kg (1.5e)
    ];

    const curve = buildErrorEnvelopeCurve(testPoints, wb, false);

    expect(curve[0].mpeUpper).toBe(10);
    expect(curve[0].mpeLower).toBe(-10);

    expect(curve[1].mpeUpper).toBe(10);
    expect(curve[1].mpeLower).toBe(-10);

    expect(curve[2].mpeUpper).toBe(20);
    expect(curve[2].mpeLower).toBe(-20);

    expect(curve[3].mpeUpper).toBe(30);
    expect(curve[3].mpeLower).toBe(-30);
  });

  it('F8-TC2: should correctly calculate indicated error Ec = P - L for plotting against envelope', () => {
    const testPoints = [
      { appliedLoad: 20000, indicatedValue: 20005, deltaL: 10 }, // P = 20005 + 10 - 10 = 20005, E = +5 kg
    ];

    const curve = buildErrorEnvelopeCurve(testPoints, wb, false);
    expect(curve[0].error).toBe(5);
    expect(curve[0].isPass).toBe(true);
  });

  it('F8-TC3: should flag points that breach the upper or lower MPE boundary', () => {
    const testPoints = [
      { appliedLoad: 10000, indicatedValue: 10015, deltaL: 10 }, // E = +15 kg > upper MPE (+10 kg) -> Fail
      { appliedLoad: 40000, indicatedValue: 39975, deltaL: 10 }, // E = -25 kg < lower MPE (-20 kg) -> Fail
    ];

    const curve = buildErrorEnvelopeCurve(testPoints, wb, false);
    expect(curve[0].isPass).toBe(false);
    expect(curve[1].isPass).toBe(false);
  });

  it('F8-TC4: should separate increasing and decreasing series to visualize hysteresis loop area', () => {
    const points = [
      { appliedLoad: 30000, indicatedValue: 29995, deltaL: 10, isIncreasing: true },  // E = -5
      { appliedLoad: 30000, indicatedValue: 30008, deltaL: 10, isIncreasing: false }, // E = +8
    ];

    const curve = buildErrorEnvelopeCurve(points, wb, false);
    const incPt = curve.find(p => p.isIncreasing === true);
    const decPt = curve.find(p => p.isIncreasing === false);

    expect(incPt.error).toBe(-5);
    expect(decPt.error).toBe(8);
    const hysteresis = Math.abs(decPt.error - incPt.error);
    expect(hysteresis).toBe(13);
    expect(hysteresis).toBeLessThanOrEqual(curve[0].mpeUpper); // 13 <= 20 kg
  });

  it('F8-TC5: should double tolerance envelope width when in-service verification mode is active', () => {
    const testPoints = [
      { appliedLoad: 10000, indicatedValue: 10015, deltaL: 10 }, // E = +15 kg
    ];

    const initialCurve = buildErrorEnvelopeCurve(testPoints, wb, false);
    const inServiceCurve = buildErrorEnvelopeCurve(testPoints, wb, true);

    expect(initialCurve[0].mpeUpper).toBe(10);
    expect(initialCurve[0].isPass).toBe(false); // +15 > 10

    expect(inServiceCurve[0].mpeUpper).toBe(20);
    expect(inServiceCurve[0].isPass).toBe(true);  // +15 <= 20
  });
});
