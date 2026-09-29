import { describe, it, expect } from 'vitest';
import {
  parseCsvText,
  processWeighbridgeCalibrationCsv,
} from '../../server/src/services/batchImportExport';
import { SAMPLE_INSTRUMENTS } from '../helpers/testUtils';

describe('Tier 2: Boundary & Corner Cases - Malformed CSV & Edge-Case Datasets', () => {
  const wb = SAMPLE_INSTRUMENTS.WEIGHBRIDGE_60T_CLASS_III;

  it('T2-C1: should throw descriptive error when CSV contains empty string or comments only', () => {
    expect(() => parseCsvText('')).toThrow('Invalid CSV content');
    expect(() => parseCsvText('# Header comment only\n# Second comment')).toThrow('at least a header row');
  });

  it('T2-C2: should strip UTF-8 Byte Order Mark (BOM: \\uFEFF) at the start of CSV file', () => {
    const bomCsv = '\uFEFFPoint,AppliedLoad,IndicatedInc,DeltaLInc,IndicatedDec,DeltaLDec\n1,0,0,10,0,10\n2,10000,10000,10,10000,10';
    const { headers, rows } = parseCsvText(bomCsv);
    expect(headers[0]).toBe('point'); // No BOM junk in first header
    expect(rows).toHaveLength(2);
  });

  it('T2-C3: should handle incomplete rows and NaN text fields gracefully defaulting to zero', () => {
    const dirtyCsv = `Point,AppliedLoad,IndicatedInc,DeltaLInc,IndicatedDec,DeltaLDec
1,0,0,10,0,10
2,10000,INVALID_TEXT,,10000,10
3,20000`; // Missing columns

    const { rows } = parseCsvText(dirtyCsv);
    const result = processWeighbridgeCalibrationCsv(rows, wb, false);

    expect(result.weighingPerformance.points).toBeDefined();
    // Non-numeric indicated value results in 0, failing tolerance check
    expect(result.weighingPerformance.overallPass).toBe(false);
  });

  it('T2-C4: should parse semicolon-separated CSVs (common in European weighbridge indicators)', () => {
    const semiCsv = `Point;AppliedLoad;IndicatedInc;DeltaLInc;IndicatedDec;DeltaLDec
1;0;0;10;0;10
2;30000;30000;10;30000;10`;

    const { headers, rows } = parseCsvText(semiCsv);
    expect(headers).toContain('appliedload');
    expect(rows).toHaveLength(2);
    expect(rows[1].appliedload).toBe('30000');
  });

  it('T2-C5: should handle high-throughput 50-point calibration series without performance degradation', () => {
    let largeCsv = 'Point,AppliedLoad,IndicatedInc,DeltaLInc,IndicatedDec,DeltaLDec\n';
    for (let i = 0; i <= 50; i++) {
      const load = i * 1200; // 0 to 60,000 kg in 50 steps
      largeCsv += `${i + 1},${load},${load},10,${load},10\n`;
    }

    const start = performance.now();
    const { rows } = parseCsvText(largeCsv);
    const result = processWeighbridgeCalibrationCsv(rows, wb, false);
    const duration = performance.now() - start;

    expect(rows).toHaveLength(51);
    expect(result.weighingPerformance.overallPass).toBe(true);
    expect(duration).toBeLessThan(500); // Must process under 500ms
  });
});
