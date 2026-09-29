/**
 * Shared visual language for official PDFs (certificate + technical data sheet).
 */
const path = require('path');
const fs = require('fs');
const QRCode = require('qrcode');

const ASSETS = path.join(__dirname, '..', '..', 'assets');
const FONT_HI = path.join(ASSETS, 'fonts', 'NotoSansDevanagari-Regular.ttf');
const FONT_HI_BOLD = path.join(ASSETS, 'fonts', 'NotoSansDevanagari-Bold.ttf');
const EMBLEM = path.join(ASSETS, 'emblem.png');
const CHAKRA = path.join(ASSETS, 'ashoka-chakra.png');

const C = {
  NAVY: '#0B2A4A',
  NAVY_SOFT: '#1E3A5F',
  SAFFRON: '#FF9933',
  GREEN: '#138808',
  INDIA_BLUE: '#000080',
  PASS: '#11683A',
  PASS_BG: '#E7F5EC',
  FAIL: '#B42318',
  FAIL_BG: '#FDECEA',
  TEXT: '#111827',
  MUTED: '#4B5563',
  FAINT: '#6B7280',
  LINE: '#CBD5E1',
  LINE_SOFT: '#E2E8F0',
  BG: '#F4F7FB',
  GOLD: '#8A6D1D',
};

const TESTS = [
  { type: 'WEIGHING_PERFORMANCE', en: 'Weighing performance (accuracy & hysteresis)', hi: 'तौल निष्पादन', clause: 'R 76-1 A.4.4' },
  { type: 'REPEATABILITY', en: 'Repeatability', hi: 'पुनरावृत्ति', clause: 'R 76-1 A.4.10' },
  { type: 'ECCENTRICITY', en: 'Eccentricity (off-centre loading)', hi: 'विकेंद्रता', clause: 'R 76-1 A.4.7' },
  { type: 'TEMPERATURE', en: 'Temperature effect on zero & span', hi: 'तापमान प्रभाव', clause: 'R 76-1 A.5.3' },
  { type: 'STABILITY', en: 'Stability & warm-up', hi: 'स्थिरता', clause: 'R 76-1 A.4.11' },
  { type: 'TIME_DEPENDENCE', en: 'Time dependence (creep & zero return)', hi: 'समय निर्भरता', clause: 'R 76-1 A.4.8' },
];

const VERIFICATION_TYPE_LABEL = {
  INITIAL: 'Initial Verification',
  PERIODIC: 'Periodic Re-verification',
  INSPECTION: 'In-service Inspection',
};

const TYPE_LABEL = {
  WEIGHBRIDGE: 'Weighbridge (Non-automatic)',
  PLATFORM_SCALE: 'Platform Weighing Machine',
  ELECTRONIC_SCALE: 'Electronic Weighing Instrument',
  LABORATORY_BALANCE: 'Laboratory Balance',
};

function registerFonts(doc) {
  if (fs.existsSync(FONT_HI)) doc.registerFont('Hindi', FONT_HI);
  if (fs.existsSync(FONT_HI_BOLD)) doc.registerFont('HindiBold', FONT_HI_BOLD);
}

function hasHindi(doc) {
  return Boolean(doc._registeredFonts && doc._registeredFonts.Hindi);
}

function formatDate(input, withTime = false) {
  if (!input) return '—';
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return String(input);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  // Render in IST regardless of server timezone.
  const ist = new Date(d.getTime() + (330 + d.getTimezoneOffset()) * 60000);
  const base = `${String(ist.getDate()).padStart(2, '0')} ${months[ist.getMonth()]} ${ist.getFullYear()}`;
  if (!withTime) return base;
  return `${base}, ${String(ist.getHours()).padStart(2, '0')}:${String(ist.getMinutes()).padStart(2, '0')} IST`;
}

function addMonths(date, months) {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

function decimalsFor(step) {
  const s = String(step);
  if (s.includes('e-')) return Number(s.split('e-')[1]);
  return s.includes('.') ? s.split('.')[1].length : 0;
}

/** Number formatter bound to an instrument's resolution. */
function numFmt(instrument, extra = 0) {
  const d = Number(instrument?.actualInterval || instrument?.verificationInterval || 0.01);
  const dp = Math.min(6, decimalsFor(d) + extra);
  return (v, signed = false) => {
    if (v === null || v === undefined || Number.isNaN(Number(v))) return '—';
    const n = Number(v);
    const s = n.toLocaleString('en-IN', { minimumFractionDigits: dp, maximumFractionDigits: dp });
    return signed && n > 0 ? `+${s}` : s;
  };
}

function classLabel(c) {
  return { CLASS_I: 'Class I (Special)', CLASS_II: 'Class II (High)', CLASS_III: 'Class III (Medium)', CLASS_IIII: 'Class IIII (Ordinary)' }[c] || c || '—';
}

function tricolor(doc, x, y, w, h = 2.2) {
  doc.save();
  doc.rect(x, y, w, h).fill(C.SAFFRON);
  doc.rect(x, y + h, w, h).fill('#FFFFFF');
  doc.rect(x, y + h * 2, w, h).fill(C.GREEN);
  doc.restore();
}

function hindi(doc, text, x, y, opts = {}, bold = false) {
  if (!hasHindi(doc)) return;
  doc.font(bold ? 'HindiBold' : 'Hindi').text(text, x, y, opts);
}

/** Bold navy band with white title (and optional right-aligned reference). */
function sectionBar(doc, x, y, w, title, ref, hiTitle, rightPad = 8) {
  doc.save();
  doc.rect(x, y, w, 17).fill(C.NAVY);
  doc.rect(x, y, 3, 17).fill(C.SAFFRON);
  doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(8.2).text(title.toUpperCase(), x + 9, y + 5, { width: w * 0.62, lineBreak: false });
  if (hiTitle && hasHindi(doc)) {
    const tw = doc.widthOfString(title.toUpperCase());
    doc.font('Hindi').fontSize(7.4).fillColor('#C7D2FE').text(hiTitle, x + 16 + tw, y + 2.6, { lineBreak: false });
  }
  if (ref) {
    doc.font('Helvetica').fontSize(6.8).fillColor('#C7D2FE').text(ref, x, y + 5.6, { width: w - rightPad, align: 'right', lineBreak: false });
  }
  doc.restore();
  return y + 17;
}

/**
 * Simple grid table. columns: [{ label, width, align }]; rows: arrays of
 * strings or { text, color, bold, bg } cells. Returns the y after the table.
 */
function table(doc, x, y, columns, rows, opts = {}) {
  const fontSize = opts.fontSize || 7.4;
  const headH = opts.headHeight || 15;
  const padX = 4;
  const totalW = columns.reduce((s, c) => s + c.width, 0);

  doc.save();
  doc.rect(x, y, totalW, headH).fill(opts.headBg || '#E8EEF6');
  let cx = x;
  columns.forEach((col) => {
    doc.fillColor(C.NAVY).font('Helvetica-Bold').fontSize(6.6)
      .text(col.label, cx + padX, y + (headH - 7) / 2, { width: col.width - padX * 2, align: col.align || 'left', lineBreak: false, ellipsis: true });
    cx += col.width;
  });
  let cy = y + headH;

  rows.forEach((row, ri) => {
    // measure row height
    let rowH = opts.rowHeight || 13;
    row.forEach((cell, ci) => {
      const text = typeof cell === 'object' && cell !== null ? String(cell.text ?? '') : String(cell ?? '');
      doc.font(cell?.bold ? 'Helvetica-Bold' : cell?.mono ? 'Courier' : 'Helvetica').fontSize(fontSize);
      const h = doc.heightOfString(text, { width: columns[ci].width - padX * 2 }) + 6;
      if (h > rowH) rowH = h;
    });
    if (ri % 2 === 1 && !opts.noZebra) doc.rect(x, cy, totalW, rowH).fill('#F8FAFC');
    cx = x;
    row.forEach((cell, ci) => {
      const col = columns[ci];
      const isObj = typeof cell === 'object' && cell !== null;
      const text = isObj ? String(cell.text ?? '') : String(cell ?? '');
      if (isObj && cell.bg) doc.rect(cx + 1, cy + 1, col.width - 2, rowH - 2).fill(cell.bg);
      doc.fillColor(isObj && cell.color ? cell.color : C.TEXT)
        .font(isObj && cell.bold ? 'Helvetica-Bold' : isObj && cell.mono ? 'Courier' : 'Helvetica')
        .fontSize(fontSize)
        .text(text, cx + padX, cy + 3.2, { width: col.width - padX * 2, align: col.align || 'left' });
      cx += col.width;
    });
    doc.moveTo(x, cy + rowH).lineTo(x + totalW, cy + rowH).lineWidth(0.4).strokeColor(C.LINE_SOFT).stroke();
    cy += rowH;
  });
  doc.rect(x, y, totalW, cy - y).lineWidth(0.6).strokeColor(C.LINE).stroke();
  doc.restore();
  return cy;
}

/** Two-column label/value grid. items: [[label, value, {bold}]] */
function keyValueGrid(doc, x, y, w, items, cols = 2) {
  const colW = w / cols;
  const labelW = colW * 0.38;
  const rowH = 14.5;
  const rows = Math.ceil(items.length / cols);
  doc.save();
  doc.rect(x, y, w, rows * rowH).fill('#FFFFFF');
  items.forEach(([label, value, opt = {}], i) => {
    const r = Math.floor(i / cols);
    const c = i % cols;
    const cx = x + c * colW;
    const cy = y + r * rowH;
    doc.rect(cx, cy, labelW, rowH).fill(C.BG);
    doc.fillColor(C.MUTED).font('Helvetica-Bold').fontSize(6.6).text(label, cx + 5, cy + 4.3, { width: labelW - 8, height: 9, ellipsis: true });
    doc.fillColor(C.TEXT).font(opt.bold ? 'Helvetica-Bold' : opt.mono ? 'Courier-Bold' : 'Helvetica').fontSize(opt.mono ? 7.4 : 7.6)
      .text(value == null || value === '' ? '—' : String(value), cx + labelW + 5, cy + 4, { width: colW - labelW - 9, height: 9, ellipsis: true });
  });
  for (let r = 0; r <= rows; r += 1) doc.moveTo(x, y + r * rowH).lineTo(x + w, y + r * rowH).lineWidth(0.4).strokeColor(C.LINE_SOFT).stroke();
  for (let c = 1; c < cols; c += 1) doc.moveTo(x + c * colW, y).lineTo(x + c * colW, y + rows * rowH).lineWidth(0.4).strokeColor(C.LINE_SOFT).stroke();
  doc.rect(x, y, w, rows * rowH).lineWidth(0.6).strokeColor(C.LINE).stroke();
  doc.restore();
  return y + rows * rowH;
}

function pill(doc, x, y, verdict, w = 44) {
  const pass = verdict === 'PASS';
  const fail = verdict === 'FAIL';
  const color = pass ? C.PASS : fail ? C.FAIL : C.FAINT;
  const bg = pass ? C.PASS_BG : fail ? C.FAIL_BG : '#F1F5F9';
  doc.save();
  doc.roundedRect(x, y, w, 12, 6).fill(bg);
  doc.roundedRect(x, y, w, 12, 6).lineWidth(0.6).strokeColor(color).stroke();
  doc.fillColor(color).font('Helvetica-Bold').fontSize(6.8).text(pass ? 'PASS' : fail ? 'FAIL' : 'N/A', x, y + 3, { width: w, align: 'center' });
  doc.restore();
}

async function qrPng(text, size = 220) {
  return QRCode.toBuffer(text, { type: 'png', width: size, margin: 1, errorCorrectionLevel: 'M', color: { dark: '#0B2A4A', light: '#FFFFFF' } });
}

function verifyUrlFor(session) {
  const base = (process.env.PUBLIC_VERIFY_URL || 'http://localhost:3000').replace(/\/+$/, '');
  const seal = session.verificationSeal ? `?seal=${session.verificationSeal}` : '';
  return `${base}/verify/${encodeURIComponent(session.certificateNo)}${seal}`;
}

/** Round rubber-stamp style seal drawn in vector. */
function officialStamp(doc, cx, cy, r, verdict) {
  const color = verdict === 'PASS' ? '#1D4ED8' : C.FAIL;
  doc.save();
  doc.opacity(0.85);
  doc.circle(cx, cy, r).lineWidth(1.6).strokeColor(color).stroke();
  doc.circle(cx, cy, r - 4).lineWidth(0.6).strokeColor(color).stroke();
  doc.circle(cx, cy, r * 0.46).lineWidth(0.6).strokeColor(color).stroke();
  // text on circle
  const text = verdict === 'PASS' ? '* LEGAL METROLOGY PUNJAB * VERIFIED ' : '* LEGAL METROLOGY PUNJAB * REJECTED ';
  doc.font('Helvetica-Bold').fontSize(6.3).fillColor(color);
  const chars = text.split('');
  const radius = r - 10;
  chars.forEach((ch, i) => {
    const a = (i / chars.length) * Math.PI * 2 - Math.PI / 2;
    doc.save();
    doc.translate(cx + radius * Math.cos(a), cy + radius * Math.sin(a));
    doc.rotate((a * 180) / Math.PI + 90);
    doc.text(ch, -2, -3, { lineBreak: false });
    doc.restore();
  });
  if (fs.existsSync(CHAKRA)) doc.image(CHAKRA, cx - r * 0.34, cy - r * 0.34, { width: r * 0.68 });
  doc.restore();
}

module.exports = {
  C,
  TESTS,
  VERIFICATION_TYPE_LABEL,
  TYPE_LABEL,
  EMBLEM,
  CHAKRA,
  registerFonts,
  hasHindi,
  formatDate,
  addMonths,
  numFmt,
  classLabel,
  tricolor,
  hindi,
  sectionBar,
  table,
  keyValueGrid,
  pill,
  qrPng,
  verifyUrlFor,
  officialStamp,
};
