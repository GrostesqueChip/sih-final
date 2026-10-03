import { describe, it, expect } from 'vitest';
import {
  INDICATOR_PROTOCOLS,
  SERIAL_PRESETS,
  detectProtocol,
  parseGeneric,
  parseIndicatorLine,
  splitFrames,
} from '../../client/src/utils/indicatorProtocols';

/**
 * Tier 1: Feature 14 - indicator output formats (USB / RS-232 capture).
 * Frames are written as the indicators send them, per the makers' interface
 * manuals; AVERY and ESSAE are the frames this app's simulator emits.
 */
const STX = '\x02';
const toledo = (weightDigits, { dec = 3, motion = false, net = false, neg = false, over = false, kg = true } = {}) => {
  const swa = 0x20 | { 0: 2, 1: 3, 2: 4, 3: 5, 4: 6, 5: 7 }[dec];
  const swb = 0x20 | (net ? 1 : 0) | (neg ? 2 : 0) | (over ? 4 : 0) | (motion ? 8 : 0) | (kg ? 16 : 0);
  return `${STX}${String.fromCharCode(swa)}${String.fromCharCode(swb)}${String.fromCharCode(0x20)}${weightDigits}000000`;
};

// [protocol key, stable frame for 12.345 kg, unstable frame for 12.345 kg]
const SAMPLES = [
  ['METTLER_SICS', 'S S     12.345 kg', 'S D     12.345 kg'],
  ['SARTORIUS_SBI', '+   12.345 kg ', '+   12.345    '],
  ['AND', 'ST,+00012.345 kg', 'US,+00012.345 kg'],
  ['CAS', 'ST,GS,0\x80,  12.345 kg', 'US,GS,0\x80,  12.345 kg'],
  ['OHAUS', '    12.345 kg  ', '    12.345 kg ?'],
  ['TOLEDO_CONTINUOUS', toledo('012345'), toledo('012345', { motion: true })],
  ['AVERY_WEIGH_TRONIX', `${STX} 0012.345 kg G S`, `${STX} 0012.345 kg G M`],
  ['ESSAE', `${STX}12.345kgS`, `${STX}12.345kgM`],
];

describe('Tier 1: Feature 14 - indicator protocol parsers', () => {
  it('F14-TC1: lists eight formats and a 9600 8-N-1 default serial preset', () => {
    expect(INDICATOR_PROTOCOLS).toHaveLength(8);
    expect(SERIAL_PRESETS[0]).toMatchObject({ baudRate: 9600, dataBits: 8, parity: 'none', stopBits: 1 });
    expect(SERIAL_PRESETS.find((p) => p.key === '2400-7E1')).toMatchObject({ baudRate: 2400, dataBits: 7, parity: 'even' });
  });

  it.each(SAMPLES)('F14-TC2: %s reads weight and stability from its own frames', (key, stable, moving) => {
    const s = parseIndicatorLine(stable, key);
    const m = parseIndicatorLine(moving, key);
    expect(s.weight).toBeCloseTo(12.345, 6);
    expect(s.stable).toBe(true);
    expect(m.weight).toBeCloseTo(12.345, 6);
    expect(m.stable).toBe(false);
  });

  it.each(SAMPLES)('F14-TC3: a stream of %s frames is identified as that format', (key, stable, moving) => {
    const det = detectProtocol([stable, moving, stable, stable, moving, stable]);
    expect(det).not.toBeNull();
    expect(det.key).toBe(key);
    expect(det.share).toBe(1);
  });

  it('F14-TC4: CAS and Toledo continuous need their brand parser (first-number fallback misreads them)', () => {
    const cas = 'ST,GS,0\x80,  12.345 kg';
    expect(parseGeneric(cas).weight).not.toBeCloseTo(12.345, 3); // picks the device-id byte "0"
    expect(parseIndicatorLine(cas, 'CAS').weight).toBeCloseTo(12.345, 6);
    const tol = toledo('012345');
    expect(parseGeneric(tol).weight).not.toBeCloseTo(12.345, 3);
    expect(parseIndicatorLine(tol, 'TOLEDO_CONTINUOUS').weight).toBeCloseTo(12.345, 6);
  });

  it('F14-TC5: Toledo continuous decodes sign, net, decimal point and over-range from the status words', () => {
    expect(parseIndicatorLine(toledo('001250', { dec: 2 }), 'TOLEDO_CONTINUOUS').weight).toBeCloseTo(12.5, 6);
    const r = parseIndicatorLine(toledo('000500', { neg: true, net: true }), 'TOLEDO_CONTINUOUS');
    expect(r.weight).toBeCloseTo(-0.5, 6);
    expect(r.net).toBe(true);
    expect(parseIndicatorLine(toledo('999999', { over: true }), 'TOLEDO_CONTINUOUS').overload).toBe(true);
  });

  it('F14-TC6: overload frames are flagged, never read as a weight', () => {
    expect(parseIndicatorLine('S +', 'METTLER_SICS').overload).toBe(true);
    expect(parseIndicatorLine('OL,+99999.999 kg', 'AND').overload).toBe(true);
    expect(parseIndicatorLine('OL,GS,0\x80,  99.999 kg', 'CAS').overload).toBe(true);
  });

  it('F14-TC7: negative and zero readings', () => {
    expect(parseIndicatorLine('S S     -0.005 kg', 'METTLER_SICS').weight).toBeCloseTo(-0.005, 6);
    expect(parseIndicatorLine('ST,-00000.005 kg', 'AND').weight).toBeCloseTo(-0.005, 6);
    expect(parseIndicatorLine('S S      0.000 kg', 'METTLER_SICS').weight).toBe(0);
  });

  it('F14-TC8: unknown or garbled input is not identified, and the fallback reports stability as not stated', () => {
    expect(detectProtocol(['hello', '???', 'ERR 12', 'xx'])).toBeNull();
    expect(detectProtocol([])).toBeNull();
    expect(parseIndicatorLine('no digits here', 'METTLER_SICS')).toBeNull();
    const g = parseIndicatorLine('GROSS 12.345 kg', null);
    expect(g.weight).toBeCloseTo(12.345, 6);
    expect(g.stable).toBeNull();
  });

  it('F14-TC9: a mostly clean stream with one corrupt frame is still identified (80 % rule)', () => {
    const lines = ['S S     12.345 kg', 'S S     12.345 kg', 'S S   12.3', 'S D     12.350 kg', 'S S     12.345 kg', 'S S     12.345 kg'];
    expect(detectProtocol(lines).key).toBe('METTLER_SICS');
    expect(detectProtocol(['S S     12.345 kg', 'garbage', 'noise', 'S S     1.0 kg'])).toBeNull();
  });

  it('F14-TC10: splitFrames handles CR, LF, CR LF and a partial trailing frame', () => {
    const [frames, rest] = splitFrames(`S S     1.000 kg\r\nS S     2.000 kg\r${STX}03.000kgS\rS S   `);
    expect(frames).toEqual(['S S     1.000 kg', 'S S     2.000 kg', `${STX}03.000kgS`]);
    expect(rest).toBe('S S   ');
    expect(splitFrames('\r\n\r\n')[0]).toEqual([]);
  });
});
