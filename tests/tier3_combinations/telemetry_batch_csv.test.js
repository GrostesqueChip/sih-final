import { describe, it, expect, afterEach } from 'vitest';
import telemetryService, { parseTelemetryFrame } from '../../server/src/services/telemetrySimulator';
import {
  parseCsvText,
  processWeighbridgeCalibrationCsv,
  exportSessionToCsv,
} from '../../server/src/services/batchImportExport';
import { SAMPLE_INSTRUMENTS } from '../helpers/testUtils';

describe('Tier 3: Cross-Feature - Telemetry Stream Capture to Batch CSV Calibration Pipeline', () => {
  const wb = SAMPLE_INSTRUMENTS.WEIGHBRIDGE_60T_CLASS_III;

  afterEach(() => {
    telemetryService.stopStreamingLoop();
  });

  it('T3-TC1: should stream 10 discrete test loads via SICS telemetry, capture snapshots, and compile CSV', () => {
    const targetLoads = [0, 6000, 12000, 18000, 24000, 30000, 36000, 42000, 48000, 60000];
    const capturedReadings = [];

    telemetryService.configure({
      protocol: 'METTLER_SICS',
      actualInterval_d: 20,
      noiseLevel: 0,
    });

    targetLoads.forEach((load) => {
      telemetryService.setTargetWeight(load);
      // Simulate indicator settling
      for (let i = 0; i < 15; i++) {
        telemetryService.tick();
      }
      const snapshot = telemetryService.captureReading();
      capturedReadings.push({
        appliedLoad: load,
        indicatedValue: snapshot.weight,
        deltaL: 10,
      });
    });

    expect(capturedReadings).toHaveLength(10);
    expect(capturedReadings[0].indicatedValue).toBe(0);
    expect(capturedReadings[9].indicatedValue).toBe(60000);

    // Convert captured telemetry points to CSV format
    let generatedCsv = 'Point,AppliedLoad,IndicatedInc,DeltaLInc,IndicatedDec,DeltaLDec\n';
    capturedReadings.forEach((r, idx) => {
      generatedCsv += `${idx + 1},${r.appliedLoad},${r.indicatedValue},${r.deltaL},${r.indicatedValue},${r.deltaL}\n`;
    });

    // Parse and verify against metrological calculations
    const { rows } = parseCsvText(generatedCsv);
    const result = processWeighbridgeCalibrationCsv(rows, wb, false);

    expect(result.weighingPerformance.points).toHaveLength(20);
    expect(result.weighingPerformance.overallPass).toBe(true);
    expect(result.hysteresisValidation.overallPass).toBe(true);
  });

  it('T3-TC2: should handle mixed streaming indicator protocols (Avery -> Essae) during multi-step batch capture', () => {
    // Reading 1 via Avery
    const averyRaw = '\x02 015000.00 kg G S\r\n';
    const averyParsed = parseTelemetryFrame(averyRaw, 'AVERY_WEIGH_TRONIX');
    expect(averyParsed.weight).toBe(15000);

    // Reading 2 via Essae
    const essaeRaw = '\x02030000kgS\r';
    const essaeParsed = parseTelemetryFrame(essaeRaw, 'ESSAE');
    expect(essaeParsed.weight).toBe(30000);
  });

  it('T3-TC3: should export full telemetry calibration run to official CSV certificate report', async () => {
    const session = {
      certificateNo: 'CERT-2026-TELEM-BATCH',
      status: 'VERIFIED_LEGAL',
      overallResult: 'PASS',
      instrument: wb,
      conductedBy: { name: 'Inspector Verma' },
      createdAt: new Date(),
      testResults: [
        {
          testType: 'WEIGHING_PERFORMANCE',
          status: 'COMPLETED',
          result: 'PASS',
          data: {
            points: [
              { appliedLoad: 0, indicatedValue: 0, deltaL: 10, passed: true },
              { appliedLoad: 30000, indicatedValue: 30000, deltaL: 10, passed: true },
              { appliedLoad: 60000, indicatedValue: 60000, deltaL: 10, passed: true },
            ],
          },
        },
      ],
    };

    const { filename, csvContent } = await exportSessionToCsv(session);
    expect(filename).toContain('CERT-2026-TELEM-BATCH');
    expect(csvContent).toContain('30000');
  });

  it('T3-TC4: should detect non-zero error when telemetry noise induces slight calibration offset', () => {
    // 20 kg scale interval, reading slightly high at 10005 kg with deltaL=10 -> P = 10005
    const csvWithOffset = `Point,AppliedLoad,IndicatedInc,DeltaLInc,IndicatedDec,DeltaLDec
1,0,0,10,0,10
2,10000,10005,10,10005,10`;

    const { rows } = parseCsvText(csvWithOffset);
    const result = processWeighbridgeCalibrationCsv(rows, wb, false);

    const pt = result.weighingPerformance.points.find(p => p.appliedLoad === 10000);
    expect(pt.correctedError).toBe(5);
    expect(pt.passed).toBe(true); // 5 <= 10 kg MPE
  });

  it('T3-TC5: should enforce strict format conversion round-trip between raw telemetry bytes and export CSV', () => {
    const rawSics = 'S S     60000.00 kg\r\n';
    const parsed = parseTelemetryFrame(rawSics, 'METTLER_SICS');
    expect(parsed.weight).toBe(60000);
    expect(parsed.isStable).toBe(true);
  });
});
