import { describe, it, expect } from 'vitest';
import { calculateTareCapacities, calculateMultiIntervalMPE, getTareAdjustedMPE } from '../../server/src/services/mpeCalculator';
import { SAMPLE_INSTRUMENTS } from '../helpers/testUtils';

describe('Tier 1: Feature 2 - Subtractive & Additive Tare Metrological Adjustments', () => {
  const wb = SAMPLE_INSTRUMENTS.WEIGHBRIDGE_60T_CLASS_III;
  const dualScale = SAMPLE_INSTRUMENTS.DUAL_INTERVAL_RETAIL_CLASS_III;

  it('F2-TC1: should calculate subtractive tare capacity reduction (Max_net = Max - T)', () => {
    // 60,000 kg weighbridge with 15,000 kg tare container -> Max_net = 45,000 kg
    const tareCap = calculateTareCapacities(wb.maxCapacity, { value: 15000, type: 'SUBTRACTIVE' });
    expect(tareCap.tareValue).toBe(15000);
    expect(tareCap.tareType).toBe('SUBTRACTIVE');
    expect(tareCap.maxNet).toBe(45000);
    expect(tareCap.maxGross).toBe(60000);
    expect(tareCap.isTareActive).toBe(true);
  });

  it('F2-TC2: should calculate additive tare gross capacity expansion (Max_gross = Max + T)', () => {
    // 60,000 kg weighbridge with 5,000 kg additive tare fixture -> Max_gross = 65,000 kg
    const tareCap = calculateTareCapacities(wb.maxCapacity, { value: 5000, type: 'ADDITIVE' });
    expect(tareCap.tareValue).toBe(5000);
    expect(tareCap.tareType).toBe('ADDITIVE');
    expect(tareCap.maxNet).toBe(60000);
    expect(tareCap.maxGross).toBe(65000);
    expect(tareCap.isTareActive).toBe(true);
  });

  it('F2-TC3: should evaluate MPE against gross load for subtractive tare per OIML R-76 clause 3.5.3.3', () => {
    // On retail scale with 5 kg subtractive tare:
    // Net load = 5 kg -> Gross load = 5 + 5 = 10 kg
    // Range 1 (0..15 kg, e=0.005 kg): 10 kg / 0.005 = 2000e -> Zone 2 (500e..2000e) -> MPE = 1.0 * 0.005 = 0.005 kg
    const result = calculateMultiIntervalMPE(5.0, dualScale.accuracyClass, dualScale.ranges, false, { value: 5.0, type: 'SUBTRACTIVE' });
    expect(result.netLoad).toBe(5.0);
    expect(result.grossLoad).toBe(10.0);
    expect(result.effectiveLoad).toBe(10.0);
    expect(result.mpeInE).toBe(1.0);
    expect(result.mpe).toBeCloseTo(0.005, 6);
  });

  it('F2-TC4: should shift multi-interval range switching boundary under high subtractive tare', () => {
    // Retail scale: Range 1 (max 15kg, e1=0.005kg), Range 2 (max 30kg, e2=0.010kg)
    // Tare = 12 kg. Net load = 6 kg -> Gross load = 18 kg (> 15 kg Max1)
    // Scale must evaluate in Range 2 with e2 = 0.010 kg!
    const result = calculateMultiIntervalMPE(6.0, dualScale.accuracyClass, dualScale.ranges, false, { value: 12.0, type: 'SUBTRACTIVE' });
    expect(result.currentRangeIndex).toBe(1);
    expect(result.currentE).toBe(0.010);
    expect(result.grossLoad).toBe(18.0);
  });

  it('F2-TC5: should handle zero tare gracefully returning baseline untared capacity and MPE', () => {
    const tareZero = calculateTareCapacities(wb.maxCapacity, { value: 0, type: 'SUBTRACTIVE' });
    expect(tareZero.isTareActive).toBe(false);
    expect(tareZero.maxNet).toBe(60000);
    expect(tareZero.maxGross).toBe(60000);

    const mpeUntared = calculateMultiIntervalMPE(10000, wb.accuracyClass, [{ max: 60000, e: 20 }], false, null);
    expect(mpeUntared.grossLoad).toBe(10000);
    expect(mpeUntared.netLoad).toBe(10000);
  });
});
