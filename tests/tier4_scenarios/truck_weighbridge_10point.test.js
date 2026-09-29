import { describe, it, expect } from 'vitest';
import {
  calculateWeighingPerformance,
  calculateRepeatability,
  calculateEccentricity,
  validateHysteresis,
  evaluateTestResult,
} from '../../server/src/services/mpeCalculator';
import { computeExpandedUncertainty } from '../../server/src/services/uncertaintyCalculator';
import { parseCsvText, processWeighbridgeCalibrationCsv, exportSessionToCsv } from '../../server/src/services/batchImportExport';
import { generateVerificationSeal } from '../../server/src/services/cryptoSeal';
import { SAMPLE_INSTRUMENTS, MOCK_OFFICER } from '../helpers/testUtils';

describe('Tier 4: Workload Scenario 1 - 10-Point Truck Weighbridge Calibration Workflow', () => {
  const wb = SAMPLE_INSTRUMENTS.WEIGHBRIDGE_60T_CLASS_III; // Max = 60,000 kg, e = 20 kg

  it('T4-S1-TC1: should execute full 10-point weighing performance test series with increasing & decreasing loads', () => {
    // 10 increasing points: 0, 6t, 12t, 18t, 24t, 30t, 36t, 42t, 48t, 60t
    // and corresponding 10 decreasing points
    const points = [
      { appliedLoad: 0, indicatedValue: 0, deltaL: 10, isIncreasing: true },
      { appliedLoad: 6000, indicatedValue: 6000, deltaL: 10, isIncreasing: true },
      { appliedLoad: 12000, indicatedValue: 12000, deltaL: 10, isIncreasing: true },
      { appliedLoad: 18000, indicatedValue: 18000, deltaL: 10, isIncreasing: true },
      { appliedLoad: 24000, indicatedValue: 24000, deltaL: 10, isIncreasing: true },
      { appliedLoad: 30000, indicatedValue: 30000, deltaL: 10, isIncreasing: true },
      { appliedLoad: 36000, indicatedValue: 36000, deltaL: 10, isIncreasing: true },
      { appliedLoad: 42000, indicatedValue: 42000, deltaL: 10, isIncreasing: true },
      { appliedLoad: 48000, indicatedValue: 48000, deltaL: 10, isIncreasing: true },
      { appliedLoad: 60000, indicatedValue: 60000, deltaL: 10, isIncreasing: true },
      // Decreasing
      { appliedLoad: 60000, indicatedValue: 60000, deltaL: 10, isIncreasing: false },
      { appliedLoad: 48000, indicatedValue: 48000, deltaL: 10, isIncreasing: false },
      { appliedLoad: 42000, indicatedValue: 42000, deltaL: 10, isIncreasing: false },
      { appliedLoad: 36000, indicatedValue: 36000, deltaL: 10, isIncreasing: false },
      { appliedLoad: 30000, indicatedValue: 30000, deltaL: 10, isIncreasing: false },
      { appliedLoad: 24000, indicatedValue: 24000, deltaL: 10, isIncreasing: false },
      { appliedLoad: 18000, indicatedValue: 18000, deltaL: 10, isIncreasing: false },
      { appliedLoad: 12000, indicatedValue: 12000, deltaL: 10, isIncreasing: false },
      { appliedLoad: 6000, indicatedValue: 6000, deltaL: 10, isIncreasing: false },
      { appliedLoad: 0, indicatedValue: 0, deltaL: 10, isIncreasing: false },
    ];

    const result = calculateWeighingPerformance(points, wb, false);
    expect(result.overallPass).toBe(true);
    expect(result.points).toHaveLength(20);
    expect(result.maxCorrectedError).toBe(0);
    expect(result.maxMpeAllowed).toBe(30); // 30 kg at 60t (1.5e)
  });

  it('T4-S1-TC2: should execute 4-position eccentricity test on weighbridge deck (Center, Left-Front, Right-Front, Left-Rear, Right-Rear)', () => {
    // Eccentricity load = 20,000 kg (1/3 Max per OIML R-76 clause 3.6.2.2)
    // MPE at 20,000 kg (1000e) = 1.0e = 20 kg
    const eccentricityData = {
      positions: [
        { position: 'CENTER', appliedLoad: 20000, indicatedValue: 20000, deltaL: 10 },
        { position: 'CORNER_FRONT_LEFT', appliedLoad: 20000, indicatedValue: 20005, deltaL: 10 },
        { position: 'CORNER_FRONT_RIGHT', appliedLoad: 20000, indicatedValue: 19995, deltaL: 10 },
        { position: 'CORNER_REAR_LEFT', appliedLoad: 20000, indicatedValue: 20008, deltaL: 10 },
        { position: 'CORNER_REAR_RIGHT', appliedLoad: 20000, indicatedValue: 19994, deltaL: 10 },
      ],
    };

    const eccResult = calculateEccentricity(eccentricityData, wb, false);
    expect(eccResult.overallPass).toBe(true);
    expect(eccResult.maxError).toBeLessThanOrEqual(eccResult.mpe); // 8 <= 20 kg
    expect(eccResult.positions).toHaveLength(5);
  });

  it('T4-S1-TC3: should execute 3-series repeatability test (at 50% Max = 30,000 kg and Max = 60,000 kg)', () => {
    // Repeatability test: 3 consecutive weighings at 30,000 kg
    const repData = {
      series: [
        { load: 30000, readings: [30000, 30005, 30000] }, // Max range = 5 kg <= 20 kg MPE
        { load: 60000, readings: [60000, 60010, 60005] }, // Max range = 10 kg <= 30 kg MPE
      ],
    };

    const repResult = calculateRepeatability(repData, wb, false);
    expect(repResult.overallPass).toBe(true);
    expect(repResult.maxRange).toBe(10);
  });

  it('T4-S1-TC4: should compute ISO GUM expanded uncertainty budget for the complete weighbridge verification session', () => {
    // Compute uncertainty at 30,000 kg test load
    const repStdDev = 5.0; // kg
    const budget = computeExpandedUncertainty(repStdDev, wb.actualInterval, 30000, wb.accuracyClass, {
      eccError: 8.0,
      e: wb.verificationInterval,
    });

    expect(budget.coverageFactor).toBe(2);
    expect(budget.expandedUncertainty).toBeGreaterThan(0);
    expect(budget.expandedUncertainty).toBeLessThan(wb.verificationInterval * 2); // U < 40 kg
  });
});
