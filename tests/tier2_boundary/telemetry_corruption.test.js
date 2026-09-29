import { describe, it, expect } from 'vitest';
import {
  parseSICSFrame,
  parseAveryFrame,
  parseEssaeFrame,
  parseTelemetryFrame,
} from '../../server/src/services/telemetrySimulator';

describe('Tier 2: Boundary & Corner Cases - Telemetry Stream Noise & Corruption', () => {
  it('T2-T1: should handle partial/truncated SICS string without throwing uncaught exceptions', () => {
    const partial = 'S S 100'; // Missing unit and CRLF
    const frame = parseSICSFrame(partial);
    expect(frame.protocol).toBe('METTLER_SICS');
    expect(frame.weight).toBe(100);
    expect(frame.isStable).toBe(true);
  });

  it('T2-T2: should detect SICS overload (+) and underload (-) special status responses', () => {
    const overloadFrame = parseSICSFrame('S +\r\n');
    expect(overloadFrame.isOverload).toBe(true);
    expect(overloadFrame.isStable).toBe(false);

    const underloadFrame = parseSICSFrame('S -\r\n');
    expect(underloadFrame.isOverload).toBe(true);
  });

  it('T2-T3: should reject completely corrupted garbage noise stream (e.g. baud rate mismatch)', () => {
    const garbageHex = '\xFF\xFE\x00\x12\xAB\xCD\xEF';
    const frame = parseTelemetryFrame(garbageHex, 'METTLER_SICS');
    expect(frame.weight).toBe(0);
    expect(frame.isStable).toBe(false);
  });

  it('T2-T4: should handle Essae frames with missing STX control header or carriage return', () => {
    // Missing STX (0x02): "025000kgS"
    const frameNoStx = parseEssaeFrame('025000kgS');
    expect(frameNoStx.protocol).toBe('ESSAE');
    expect(frameNoStx.weight).toBe(25000);
    expect(frameNoStx.unit).toBe('kg');
    expect(frameNoStx.isStable).toBe(true);
  });

  it('T2-T5: should extract valid numeric weights from strings containing extraneous whitespace or tabs', () => {
    const messySics = 'S   S       \t   1250.75   \t  kg  \r\n';
    const frame = parseSICSFrame(messySics);
    expect(frame.weight).toBe(1250.75);
    expect(frame.unit).toBe('kg');
    expect(frame.isStable).toBe(true);
  });
});
