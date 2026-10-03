/**
 * Serial output formats of common weighing indicators: parse one line, and
 * identify which format a stream is in.
 *
 * A line is one frame with its CR / LF terminator removed (a leading STX may
 * remain). Formats follow the manufacturers' published interface manuals;
 * AVERY and ESSAE are the frames this app's own simulator emits. None of
 * this replaces a trial with the physical indicator: firmware variants exist.
 */

const STX = '\x02';
const decimalsOf = (s) => (s.includes('.') ? s.split('.')[1].length : 0);
const reading = (weight, unit, stable, extra = {}) => ({ weight, unit, stable, overload: false, net: false, ...extra });

// Mettler-Toledo MT-SICS: "S S     12.345 kg" stable, "S D ..." dynamic, "S +" / "S -" out of range.
const SICS = /^S ([SD])\s+(-?\d+(?:\.\d+)?)\s+([A-Za-z]+)$/;
function parseSics(line) {
  if (line === 'S +' || line === 'S -') return reading(0, '', false, { overload: true });
  const m = SICS.exec(line);
  return m ? reading(Number(m[2]), m[3], m[1] === 'S', { decimals: decimalsOf(m[2]) }) : null;
}

// Sartorius SBI: sign, value, space, unit; the unit is blank while the reading is unstable.
const SBI = /^([+-])\s*(\d+(?:\.\d+)?) ([A-Za-z ]{0,3})\s*$/;
function parseSbi(line) {
  const t = line.trim();
  if (t === 'High' || t === 'Low') return reading(0, '', false, { overload: true });
  const m = SBI.exec(line);
  if (!m) return null;
  const unit = m[3].trim();
  return reading(Number(m[1] + m[2]), unit, Boolean(unit), { decimals: decimalsOf(m[2]) });
}

// A&D: "ST,+00012.345 kg" stable, "US," unstable, "OL," out of range, "QT," stable count.
const AND = /^(ST|US|OL|QT),([+-]\d+(?:\.\d+)?)\s*([A-Za-z]+)$/;
function parseAnd(line) {
  const m = AND.exec(line);
  return m ? reading(Number(m[2]), m[3], m[1] === 'ST', { overload: m[1] === 'OL', decimals: decimalsOf(m[2]) }) : null;
}

// CAS: "ST,GS,<id><lamp>,  12.345 kg". The two bytes after GS / NT are a device id and a lamp byte, not weight.
const CAS = /^(ST|US|OL),(GS|NT),[\s\S]{2},\s*(-?\d+(?:\.\d+)?)\s*([A-Za-z]+)\s*$/;
function parseCas(line) {
  const m = CAS.exec(line);
  return m ? reading(Number(m[3]), m[4], m[1] === 'ST', { overload: m[1] === 'OL', net: m[2] === 'NT', decimals: decimalsOf(m[3]) }) : null;
}

// Ohaus: value, unit, then "?" while unstable.
const OHAUS = /^\s*(-?\d+(?:\.\d+)?) ([A-Za-z]+)\s*(\?)?\s*$/;
function parseOhaus(line) {
  if (line.startsWith('Err')) return reading(0, '', false, { overload: true });
  const m = OHAUS.exec(line);
  return m ? reading(Number(m[1]), m[2], !m[3], { decimals: decimalsOf(m[1]) }) : null;
}

// Mettler-Toledo continuous output: STX, status words A B C, 6 weight digits, 6 tare digits.
// Status word A bits 0-2 give the decimal point; B: net, negative, over range, motion, kg.
const TOLEDO_DP = { 2: 0, 3: 1, 4: 2, 5: 3, 6: 4, 7: 5 };
function parseToledo(raw) {
  const line = raw.startsWith(STX) ? raw.slice(1) : raw;
  if (line.length < 15 || !/^\d{12}$/.test(line.slice(3, 15))) return null;
  const swa = line.charCodeAt(0);
  const swb = line.charCodeAt(1);
  if (!(swa & 0x20) || !(swb & 0x20)) return null;
  const dec = TOLEDO_DP[swa & 0b111];
  if (dec === undefined) return null;
  const w = Number(line.slice(3, 9)) / 10 ** dec;
  return reading(swb & 2 ? -w : w, swb & 16 ? 'kg' : 'lb', !(swb & 8), { overload: Boolean(swb & 4), net: Boolean(swb & 1), decimals: dec });
}

// Avery Weigh-Tronix style line, as emitted by this app's simulator: STX, sign, value, unit, G/N, S/M.
const AVERY = /^\x02?([ -])(\d+(?:\.\d+)?) ([A-Za-z]+) ([GN]) ([SM])$/;
function parseAvery(line) {
  const m = AVERY.exec(line);
  if (!m) return null;
  const w = Number(m[2]);
  return reading(m[1] === '-' ? -w : w, m[3], m[5] === 'S', { net: m[4] === 'N', decimals: decimalsOf(m[2]) });
}

// Essae style frame, as emitted by this app's simulator: STX, digits, unit, S/M.
const ESSAE = /^\x02?(\d+(?:\.\d+)?)([a-z]+)([SM])$/;
function parseEssae(line) {
  const m = ESSAE.exec(line);
  return m ? reading(Number(m[1]), m[2], m[3] === 'S', { decimals: decimalsOf(m[1]) }) : null;
}

/** Most specific formats first: the generic ones (SBI, Ohaus) also accept some other makers' lines. */
export const INDICATOR_PROTOCOLS = [
  { key: 'TOLEDO_CONTINUOUS', maker: 'Mettler-Toledo', label: 'Mettler-Toledo continuous', parse: parseToledo },
  { key: 'CAS', maker: 'CAS', label: 'CAS', parse: parseCas },
  { key: 'AND', maker: 'A&D', label: 'A&D', parse: parseAnd },
  { key: 'METTLER_SICS', maker: 'Mettler-Toledo', label: 'Mettler-Toledo SICS', parse: parseSics },
  { key: 'AVERY_WEIGH_TRONIX', maker: 'Avery Weigh-Tronix', label: 'Avery Weigh-Tronix', parse: parseAvery },
  { key: 'ESSAE', maker: 'Essae-Teraoka', label: 'Essae-Teraoka', parse: parseEssae },
  { key: 'SARTORIUS_SBI', maker: 'Sartorius', label: 'Sartorius SBI', parse: parseSbi },
  { key: 'OHAUS', maker: 'Ohaus', label: 'Ohaus', parse: parseOhaus },
];

const BY_KEY = Object.fromEntries(INDICATOR_PROTOCOLS.map((p) => [p.key, p]));

/** Serial line settings an indicator may ship with. The app default is the first. */
export const SERIAL_PRESETS = [
  { key: '9600-8N1', label: '9600 8-N-1', baudRate: 9600, dataBits: 8, parity: 'none', stopBits: 1 },
  { key: '2400-7E1', label: '2400 7-E-1 (A&D default)', baudRate: 2400, dataBits: 7, parity: 'even', stopBits: 1 },
  { key: '1200-7O1', label: '1200 7-O-1 (Sartorius default)', baudRate: 1200, dataBits: 7, parity: 'odd', stopBits: 1 },
  { key: '4800-8N1', label: '4800 8-N-1', baudRate: 4800, dataBits: 8, parity: 'none', stopBits: 1 },
  { key: '19200-8N1', label: '19200 8-N-1', baudRate: 19200, dataBits: 8, parity: 'none', stopBits: 1 },
];

/** Split a received chunk into complete frames; returns [frames, remainder]. */
export function splitFrames(buffer) {
  const parts = buffer.split(/[\r\n]+/);
  const rest = parts.pop();
  return [parts.filter((p) => p.replace(/\x02/g, '').trim() !== ''), rest];
}

/**
 * Name the format of a batch of lines.
 * @returns {{ key: string, label: string, share: number } | null} null when no format parses at least 80 % of the lines
 */
export function detectProtocol(lines, minShare = 0.8) {
  if (!lines || lines.length === 0) return null;
  let best = null;
  for (const p of INDICATOR_PROTOCOLS) {
    const share = lines.filter((l) => p.parse(l) !== null).length / lines.length;
    if (!best || share > best.share) best = { key: p.key, label: p.label, share };
  }
  return best && best.share >= minShare ? best : null;
}

/** Fallback for an unknown format: the first number in the line is taken as the weight. */
const FIRST_NUMBER = /([+-]?\s*\d+(?:\.\d+)?)/;
export function parseGeneric(line) {
  const m = FIRST_NUMBER.exec(line);
  if (!m) return null;
  return { weight: parseFloat(m[1].replace(/\s+/g, '')), unit: '', stable: null, overload: false, net: false };
}

/**
 * Parse one line. With a protocol key the brand parser is used; without one,
 * or when it does not match, the generic fallback applies (stable = null means
 * "not stated by the indicator": the caller decides from successive readings).
 */
export function parseIndicatorLine(line, protocolKey) {
  const p = protocolKey ? BY_KEY[protocolKey] : null;
  return (p && p.parse(line)) || parseGeneric(line);
}
