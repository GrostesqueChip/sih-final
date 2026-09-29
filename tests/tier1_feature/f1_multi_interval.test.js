import { describe, it, expect } from 'vitest';
import { calculateMultiIntervalMPE, getMPE } from '../../server/src/services/mpeCalculator';
import { SAMPLE_INSTRUMENTS } from '../helpers/testUtils';

describe('Tier 1: Feature 1 - Multi-Interval & Multi-Range Metrology Engine', () => {
  const dualScale = SAMPLE_INSTRUMENTS.DUAL_INTERVAL_RETAIL_CLASS_III;
  const tripleScale = SAMPLE_INSTRUMENTS.TRIPLE_INTERVAL_LAB_CLASS_II;

  it('F1-TC1: should correctly select e1 interval and compute ±0.5e1 in lower zone of Range 1', () => {
    // Range 1: 0..15 kg, e1 = 0.005 kg (5 g)
    // 2 kg = 400 e1 -> Zone 1 (<= 500e) -> MPE = ±0.5e1 = ±0.0025 kg
    const result = calculateMultiIntervalMPE(2.0, dualScale.accuracyClass, dualScale.ranges, false);
    expect(result.currentRangeIndex).toBe(0);
    expect(result.currentE).toBe(0.005);
    expect(result.mpeInE).toBe(0.5);
    expect(result.mpe).toBeCloseTo(0.0025, 6);
  });

  it('F1-TC2: should correctly switch to e1 zone 2 (500e..2000e) for loads up to Range 1 max', () => {
    // 5 kg = 1000 e1 -> Zone 2 (500e..2000e) -> MPE = ±1.0e1 = ±0.005 kg
    const result = calculateMultiIntervalMPE(5.0, dualScale.accuracyClass, dualScale.ranges, false);
    expect(result.currentRangeIndex).toBe(0);
    expect(result.currentE).toBe(0.005);
    expect(result.mpeInE).toBe(1.0);
    expect(result.mpe).toBeCloseTo(0.005, 6);
  });

  it('F1-TC3: should switch to Range 2 (e2 = 0.010 kg) immediately above Range 1 Max (15 kg)', () => {
    // 16 kg > 15 kg -> Range 2 (15..30 kg), e2 = 0.010 kg (10 g)
    // 16 kg = 1600 e2 -> Zone 2 (500e..2000e) -> MPE = ±1.0e2 = ±0.010 kg
    const result = calculateMultiIntervalMPE(16.0, dualScale.accuracyClass, dualScale.ranges, false);
    expect(result.currentRangeIndex).toBe(1);
    expect(result.currentE).toBe(0.010);
    expect(result.mpeInE).toBe(1.0);
    expect(result.mpe).toBeCloseTo(0.010, 6);
  });

  it('F1-TC4: should apply in-service 2x multiplier across tiered multi-interval ranges', () => {
    // Range 2 at 25 kg: initial MPE = ±1.5e2 (2500 e2 -> >2000e), in-service = 2 * 1.5e2 = ±3.0e2 = ±0.030 kg
    const initial = calculateMultiIntervalMPE(25.0, dualScale.accuracyClass, dualScale.ranges, false);
    const inService = calculateMultiIntervalMPE(25.0, dualScale.accuracyClass, dualScale.ranges, true);
    
    expect(initial.mpeInE).toBe(1.5);
    expect(initial.mpe).toBeCloseTo(0.015, 6);
    expect(inService.mpeInE).toBe(3.0);
    expect(inService.mpe).toBeCloseTo(0.030, 6);
  });

  it('F1-TC5: should accurately evaluate triple-interval Class II scale transitions across e1, e2, e3', () => {
    // Triple interval: Range 1 (0..1000g, e1=0.01g), Range 2 (1000..3000g, e2=0.02g), Range 3 (3000..6000g, e3=0.05g)
    // Point A: 50g -> Range 1, load/e1 = 5000e1 -> Zone 1 (<= 5000e) -> MPE = 0.5 * 0.01 = 0.005 g
    const resA = calculateMultiIntervalMPE(50, tripleScale.accuracyClass, tripleScale.ranges, false);
    expect(resA.currentRangeIndex).toBe(0);
    expect(resA.currentE).toBe(0.01);
    expect(resA.mpe).toBeCloseTo(0.005, 6);

    // Point B: 2000g -> Range 2, load/e2 = 100000e2 -> Zone 3 (>20000e) -> MPE = 1.5 * 0.02 = 0.030 g
    const resB = calculateMultiIntervalMPE(2000, tripleScale.accuracyClass, tripleScale.ranges, false);
    expect(resB.currentRangeIndex).toBe(1);
    expect(resB.currentE).toBe(0.02);
    expect(resB.mpe).toBeCloseTo(0.030, 6);

    // Point C: 5000g -> Range 3, load/e3 = 100000e3 -> Zone 3 (>20000e) -> MPE = 1.5 * 0.05 = 0.075 g
    const resC = calculateMultiIntervalMPE(5000, tripleScale.accuracyClass, tripleScale.ranges, false);
    expect(resC.currentRangeIndex).toBe(2);
    expect(resC.currentE).toBe(0.05);
    expect(resC.mpe).toBeCloseTo(0.075, 6);
  });
});
