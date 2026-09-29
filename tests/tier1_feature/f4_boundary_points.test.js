import { describe, it, expect } from 'vitest';
import { generateBoundaryLoadPoints, validateHysteresis } from '../../server/src/services/mpeCalculator';
import { SAMPLE_INSTRUMENTS } from '../helpers/testUtils';

describe('Tier 1: Feature 4 - OIML R-76 Boundary Step Point Generator & Hysteresis Validator', () => {
  const wb = SAMPLE_INSTRUMENTS.WEIGHBRIDGE_60T_CLASS_III; // Max=60000kg, e=20kg
  const dualScale = SAMPLE_INSTRUMENTS.DUAL_INTERVAL_RETAIL_CLASS_III;

  it('F4-TC1: should generate exact Class III step points (Min 20e, 500e, 2000e, 50% Max, Max)', () => {
    // e=20kg: Min = 20*20 = 400kg; 500e = 10,000kg; 2000e = 40,000kg; 50% Max = 30,000kg; Max = 60,000kg
    const points = generateBoundaryLoadPoints(wb, { isInService: false });
    const loads = points.map(p => p.nominalLoad);

    expect(loads).toContain(0);       // Zero
    expect(loads).toContain(400);     // Min (20e)
    expect(loads).toContain(10000);   // 500e step
    expect(loads).toContain(30000);   // 50% Max
    expect(loads).toContain(40000);   // 2000e step
    expect(loads).toContain(60000);   // Max (3000e)
  });

  it('F4-TC2: should correctly calculate ±MPE for each boundary step point', () => {
    const points = generateBoundaryLoadPoints(wb, { isInService: false });
    
    const ptZero = points.find(p => p.nominalLoad === 0);
    const pt500e = points.find(p => p.nominalLoad === 10000);
    const pt2000e = points.find(p => p.nominalLoad === 40000);
    const ptMax = points.find(p => p.nominalLoad === 60000);

    expect(pt500e.mpeInE).toBe(0.5);  // 500e -> ±0.5e (10 kg)
    expect(pt500e.mpe).toBe(10);
    expect(pt2000e.mpeInE).toBe(1.0); // 2000e -> ±1.0e (20 kg)
    expect(pt2000e.mpe).toBe(20);
    expect(ptMax.mpeInE).toBe(1.5);   // 3000e (>2000e) -> ±1.5e (30 kg)
    expect(ptMax.mpe).toBe(30);
  });

  it('F4-TC3: should generate multi-interval boundary step points for dual-interval scales', () => {
    // Dual scale: Range 1 (0..15kg, e1=0.005kg), Range 2 (15..30kg, e2=0.010kg)
    const points = generateBoundaryLoadPoints(dualScale, { isInService: false });
    const loads = points.map(p => p.nominalLoad);

    expect(loads).toContain(0);
    expect(loads).toContain(15); // Switching point
    expect(loads).toContain(30); // Max
  });

  it('F4-TC4: should validate hysteresis passing condition (Hys <= MPE) across increasing/decreasing points', () => {
    const inc = [
      { appliedLoad: 10000, indicatedValue: 10000, deltaL: 10 }, // P = 10000
      { appliedLoad: 30000, indicatedValue: 30000, deltaL: 10 }, // P = 30000
      { appliedLoad: 60000, indicatedValue: 60000, deltaL: 10 }, // P = 60000
    ];
    const dec = [
      { appliedLoad: 60000, indicatedValue: 60000, deltaL: 10 }, // P = 60000
      { appliedLoad: 30000, indicatedValue: 30010, deltaL: 10 }, // P = 30010, Hys = 10 kg <= MPE (20 kg)
      { appliedLoad: 10000, indicatedValue: 10005, deltaL: 10 }, // P = 10005, Hys = 5 kg <= MPE (10 kg)
    ];

    const result = validateHysteresis(inc, dec, wb, false);
    expect(result.overallPass).toBe(true);
    expect(result.maxHysteresis).toBe(10);
    expect(result.evaluations).toHaveLength(3);
  });

  it('F4-TC5: should detect hysteresis violation when |P_dec - P_inc| exceeds MPE tolerance', () => {
    const inc = [
      { appliedLoad: 10000, indicatedValue: 10000, deltaL: 10 }, // P = 10000
    ];
    const dec = [
      { appliedLoad: 10000, indicatedValue: 10025, deltaL: 10 }, // P = 10025, Hys = 25 kg > MPE (10 kg)
    ];

    const result = validateHysteresis(inc, dec, wb, false);
    expect(result.overallPass).toBe(false);
    expect(result.maxHysteresis).toBe(25);
    expect(result.evaluations[0].passed).toBe(false);
  });
});
