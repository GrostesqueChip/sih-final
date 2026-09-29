import { describe, it, expect } from 'vitest';
import {
  parseCsvText,
  processWeighbridgeCalibrationCsv,
  generateSampleCsvTemplate,
  exportSessionToCsv,
} from '../../server/src/services/batchImportExport';
import { SAMPLE_INSTRUMENTS } from '../helpers/testUtils';

describe('Tier 1: Feature 7 - High-Throughput 10-Point Weighbridge CSV Import & Export Engine', () => {
  const wb = SAMPLE_INSTRUMENTS.WEIGHBRIDGE_60T_CLASS_III;

  const validWideCsv = `Point,AppliedLoad,IndicatedInc,DeltaLInc,IndicatedDec,DeltaLDec
1,0,0,10,0,10
2,6000,6000,10,6000,10
3,12000,12000,10,12000,10
4,18000,18000,10,18000,10
5,24000,24000,10,24000,10
6,30000,30000,10,30000,10
7,36000,36000,10,36000,10
8,42000,42000,10,42000,10
9,48000,48000,10,48000,10
10,60000,60000,10,60000,10`;

  it('F7-TC1: should parse raw CSV text supporting multiple delimiters and quotes', () => {
    const { headers, rows } = parseCsvText(validWideCsv);
    expect(headers).toContain('point');
    expect(headers).toContain('appliedload');
    expect(rows).toHaveLength(10);
    expect(rows[0].appliedload).toBe('0');
    expect(rows[9].appliedload).toBe('60000');
  });

  it('F7-TC2: should process 10-point weighbridge calibration and compute errors and MPE for all points', () => {
    const { rows } = parseCsvText(validWideCsv);
    const result = processWeighbridgeCalibrationCsv(rows, wb, false);

    expect(result.weighingPerformance.points).toHaveLength(20); // 10 increasing + 10 decreasing
    expect(result.weighingPerformance.overallPass).toBe(true);
    expect(result.hysteresisValidation.evaluations).toHaveLength(10);
    expect(result.hysteresisValidation.overallPass).toBe(true);
  });

  it('F7-TC3: should correctly detect failing points when indicated error exceeds MPE', () => {
    const failingCsv = `Point,AppliedLoad,IndicatedInc,DeltaLInc,IndicatedDec,DeltaLDec
1,0,0,10,0,10
2,10000,10080,10,10080,10`; // Error = +80 kg > MPE (10 kg)

    const { rows } = parseCsvText(failingCsv);
    const result = processWeighbridgeCalibrationCsv(rows, wb, false);

    expect(result.weighingPerformance.overallPass).toBe(false);
    const failedPt = result.weighingPerformance.points.find(p => p.appliedLoad === 10000);
    expect(failedPt.passed).toBe(false);
  });

  it('F7-TC4: should generate standard 10-point CSV calibration template for an instrument', () => {
    const template = generateSampleCsvTemplate(wb);
    expect(template).toContain('Point');
    expect(template).toContain('AppliedLoad');
    expect(template).toContain('60000'); // Max capacity
  });

  it('F7-TC5: should export full test session data into standardized Legal Metrology CSV format', async () => {
    const mockSession = {
      certificateNo: 'CERT-2026-WB-001',
      status: 'VERIFIED_LEGAL',
      overallResult: 'PASS',
      instrument: wb,
      conductedBy: { name: 'Inspector Sharma' },
      createdAt: new Date('2026-08-30'),
      testResults: [
        {
          testType: 'WEIGHING_PERFORMANCE',
          status: 'COMPLETED',
          result: 'PASS',
          data: {
            points: [
              { appliedLoad: 0, indicatedValue: 0, deltaL: 10, continuousIndication: 0, error: 0, passed: true },
              { appliedLoad: 30000, indicatedValue: 30000, deltaL: 10, continuousIndication: 30000, error: 0, passed: true },
            ],
          },
        },
      ],
    };

    const { filename, csvContent } = await exportSessionToCsv(mockSession);
    expect(filename).toContain('CERT-2026-WB-001');
    expect(csvContent).toContain('NATIONAL LEGAL METROLOGY');
    expect(csvContent).toContain('WEIGHING_PERFORMANCE');
  });
});
