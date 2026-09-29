import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import telemetryService, {
  parseSICSFrame,
  parseAveryFrame,
  parseEssaeFrame,
  parseTelemetryFrame,
} from '../../server/src/services/telemetrySimulator';

describe('Tier 1: Feature 5 - RS-232 / USB Serial Indicator Telemetry Streaming Engine', () => {
  afterEach(() => {
    telemetryService.stopStreamingLoop();
  });

  it('F5-TC1: should parse Mettler Toledo SICS standard frames (Stable & Dynamic)', () => {
    // Stable weight frame: "S S      100.00 kg\r\n"
    const stableFrame = parseSICSFrame('S S      100.00 kg\r\n');
    expect(stableFrame.protocol).toBe('METTLER_SICS');
    expect(stableFrame.weight).toBe(100.00);
    expect(stableFrame.unit).toBe('kg');
    expect(stableFrame.isStable).toBe(true);
    expect(stableFrame.isZero).toBe(false);

    // Dynamic/unstable frame: "S D       50.50 kg\r\n"
    const dynamicFrame = parseSICSFrame('S D       50.50 kg\r\n');
    expect(dynamicFrame.weight).toBe(50.50);
    expect(dynamicFrame.isStable).toBe(false);
  });

  it('F5-TC2: should parse Avery Weigh-Tronix continuous ASCII streaming frames', () => {
    // Avery frame: "\x02 00250.00 kg G S\r\n"
    const frame = parseAveryFrame('\x02 00250.00 kg G S\r\n');
    expect(frame.protocol).toBe('AVERY_WEIGH_TRONIX');
    expect(frame.weight).toBe(250.00);
    expect(frame.unit).toBe('kg');
    expect(frame.isStable).toBe(true);
    expect(frame.tareStatus).toBe('GROSS');
  });

  it('F5-TC3: should parse Essae / Teraoka weighbridge indicator continuous frames', () => {
    // Essae frame: "\x02050000kgS\r" (50,000 kg stable)
    const frame = parseEssaeFrame('\x02050000kgS\r');
    expect(frame.protocol).toBe('ESSAE');
    expect(frame.weight).toBe(50000);
    expect(frame.unit).toBe('kg');
    expect(frame.isStable).toBe(true);
  });

  it('F5-TC4: should generate live telemetry frames in configured protocol format', () => {
    telemetryService.configure({
      protocol: 'METTLER_SICS',
      unit: 'kg',
      targetWeight: 1500,
      actualInterval_d: 10,
    });
    telemetryService.setTargetWeight(1500);

    const frame = telemetryService.generateFrame();
    expect(frame.protocol).toBe('METTLER_SICS');
    expect(frame.rawAscii).toContain('S');
    expect(frame.rawAscii).toContain('kg');
    expect(frame.rawHex).toBeDefined();
    expect(frame.timestamp).toBeDefined();
  });

  it('F5-TC5: should handle indicator command execution (Zero, Tare, Clear Tare)', () => {
    telemetryService.setTargetWeight(500);
    expect(telemetryService.targetWeight).toBe(500);

    // Apply Tare
    const tareRes = telemetryService.tare();
    expect(tareRes.success).toBe(true);
    expect(telemetryService.isTareActive).toBe(true);

    // Clear Tare
    const clearRes = telemetryService.clearTare();
    expect(clearRes.success).toBe(true);
    expect(telemetryService.isTareActive).toBe(false);

    // Zero
    const zeroRes = telemetryService.zero();
    expect(zeroRes.success).toBe(true);
    expect(telemetryService.isZero).toBe(true);
  });
});
