/**
 * OIML R 76 Type Evaluation Test Report (model approval).
 *
 * Produced for sessions of type TYPE_EVALUATION instead of a verification
 * certificate. The layout follows the structure of the OIML R 76-2:2007 test
 * report format — identification, general information on the type, test
 * equipment and conditions, summary of the type evaluation — and states
 * plainly which R 76-2 tests are NOT covered by this report, so the document
 * never implies a complete type evaluation it did not perform.
 *
 * Every figure is read from the stored, sealed calculations; the detailed test
 * forms are in the Technical Data Sheet generated from the same readings.
 */
const PDFDocument = require('pdfkit');
const fs = require('fs');
const T = require('./pdfTheme');
const { computeExpandedUncertainty } = require('./uncertaintyCalculator');
const { TYPE_EVALUATION_TEST_TYPES } = require('../lib/sessionTypes');

const { C } = T;

/**
 * R 76-2 test forms that this software does not (yet) record. Listed on every
 * report so the reader knows the scope of the evaluation.
 */
const NOT_COVERED = [
  ['Zero-setting range, accuracy & zero-tracking', 'A.4.2'],
  ['Tare (weighing test with tare, tare accuracy)', 'A.4.6'],
  ['Discrimination', 'A.4.8'],
  ['Sensitivity (non-self-indicating)', 'A.4.9'],
  ['Stability of equilibrium', 'A.4.12'],
  ['Tilting', 'A.5.1'],
  ['Voltage variations', 'A.5.4'],
  ['Damp heat, steady state', 'B.2'],
  ['Disturbances (dips, bursts, surges, ESD, EMC)', 'B.3'],
  ['Span stability', 'B.4'],
  ['Endurance', 'A.6'],
  ['Examination of construction / checklist', 'R 76-2 §4'],
];

/** Edition of the OIML limits the stored results were evaluated against (recorded with each result). */
function ruleSetLabel(session) {
  const { getRuleSet, getActiveRuleSet } = require('../lib/ruleSets');
  const id = (session.testResults || []).map((r) => r.calculations?.ruleSet).find(Boolean);
  const rs = (id && getRuleSet(id)) || getActiveRuleSet();
  return `${rs.title} (rule set ${rs.id})`;
}

async function generateTypeEvaluationReport(sessionData) {
  // Lazy require: pdfCertificate requires this module for dispatch.
  const { keyFinding } = require('./pdfCertificate');
  const session = sessionData || {};
  const inst = session.instrument || {};
  const officer = session.conductedBy || {};
  const results = Object.fromEntries((session.testResults || []).map((r) => [r.testType, r]));
  const unit = inst.unit || 'kg';
  const fmt = T.numFmt(inst);
  const lim = T.limitFmt(inst);
  const e = Number(inst.verificationInterval || 0.001);

  const verdict = session.overallResult === 'PASS' || session.overallResult === 'FAIL' ? session.overallResult : 'UNKNOWN';
  const pass = verdict === 'PASS';
  const testedAt = session.completedAt || session.sealedAt;

  const rep = results.REPEATABILITY?.calculations;
  const ecc = results.ECCENTRICITY?.calculations;
  const budget = computeExpandedUncertainty(rep?.maxStdDev || 0, Number(inst.actualInterval || e), Number(inst.maxCapacity || 0), inst.accuracyClass, {
    eccError: ecc?.maxDifferenceFromCenter || 0,
    ranges: inst.ranges,
    e,
  });

  const verifyUrl = T.verifyUrlFor(session);
  const qr = await T.qrPng(verifyUrl, 240);

  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        margins: { top: 0, bottom: 0, left: 0, right: 0 },
        info: {
          Title: `OIML R 76 Type Evaluation Test Report ${session.certificateNo}`,
          Author: 'Legal Metrology Division, Department of Consumer Affairs',
          Subject: 'OIML R 76 type evaluation of a non-automatic weighing instrument (model approval)',
          Creator: 'NAWI-ReportPro',
        },
      });
      T.registerFonts(doc);
      const chunks = [];
      doc.on('data', (c) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));

      const W = doc.page.width;
      const H = doc.page.height;
      const M = 30;
      const X = M + 12;
      const CW = W - 2 * X;

      // ---- Frame ----
      doc.rect(M, M, W - 2 * M, H - 2 * M).lineWidth(1.4).strokeColor(C.NAVY).stroke();
      T.tricolor(doc, M + 4, M + 4, W - 2 * M - 8, 2.2);

      // ---- Header ----
      let y = M + 16;
      if (fs.existsSync(T.EMBLEM)) doc.image(T.EMBLEM, X, y, { height: 44 });
      doc.fontSize(8);
      T.hindi(doc, 'भारत सरकार  |  उपभोक्ता मामले विभाग', X + 40, y + 2, { width: 300 }, true);
      doc.font('Helvetica-Bold').fontSize(8.4).fillColor(C.NAVY)
        .text('GOVERNMENT OF INDIA · DEPARTMENT OF CONSUMER AFFAIRS', X + 40, y + 16, { width: 330 });
      doc.font('Helvetica').fontSize(7).fillColor(C.MUTED)
        .text('Legal Metrology Division · Designated laboratory for model approval', X + 40, y + 27, { width: 330 });
      doc.image(qr, X + CW - 58, y - 4, { width: 58 });
      y += 52;

      doc.moveTo(X, y).lineTo(X + CW, y).lineWidth(0.5).strokeColor(C.LINE).stroke();
      y += 8;
      doc.fontSize(12).fillColor(C.NAVY);
      T.hindi(doc, 'प्रकार मूल्यांकन परीक्षण रिपोर्ट', X, y, { width: CW, align: 'center' }, true);
      y += T.hasHindi(doc) ? 17 : 0;
      doc.font('Helvetica-Bold').fontSize(15).fillColor(C.NAVY)
        .text('OIML R 76 TYPE EVALUATION TEST REPORT', X, y, { width: CW, align: 'center', characterSpacing: 0.8 });
      y += 19;
      doc.font('Helvetica-Oblique').fontSize(6.9).fillColor(C.MUTED).text(
        'Non-automatic weighing instrument · structured after the OIML R 76-2:2007 test report format · prepared for model approval under the Legal Metrology (Approval of Models) Rules, 2011.',
        X + 30, y, { width: CW - 60, align: 'center' }
      );
      y += 20;

      // ---- Identification strip ----
      const strip = [
        ['REPORT NO.', session.certificateNo || '—', true],
        ['DATE OF TESTS', T.formatDate(session.startedAt || testedAt)],
        ['REPORT SEALED', T.formatDate(session.sealedAt || testedAt)],
        ['SUMMARY', pass ? 'ALL TESTS PASSED' : verdict === 'FAIL' ? 'ONE OR MORE FAILED' : '—'],
      ];
      const sw = CW / strip.length;
      strip.forEach(([label, value, mono], i) => {
        const sx = X + i * sw;
        doc.rect(sx, y, sw - (i < strip.length - 1 ? 4 : 0), 28).fill(i === 0 ? C.NAVY : i === 3 ? (pass ? C.PASS_BG : C.FAIL_BG) : C.BG);
        doc.fillColor(i === 0 ? '#BFD2EA' : C.FAINT).font('Helvetica-Bold').fontSize(6.1).text(label, sx + 7, y + 5, { width: sw - 14 });
        doc.fillColor(i === 0 ? '#FFFFFF' : i === 3 ? (pass ? C.PASS : C.FAIL) : C.TEXT)
          .font(mono ? 'Courier-Bold' : 'Helvetica-Bold').fontSize(mono ? 9.2 : 8.2)
          .text(value, sx + 7, y + 15, { width: sw - 14, lineBreak: false, ellipsis: true });
      });
      y += 34;

      // ---- 1. General information on the type ----
      const n = inst.maxCapacity && e ? Math.round(Number(inst.maxCapacity) / e) : null;
      y = T.sectionBar(doc, X, y, CW, '1. General information on the type', 'R 76-2 §1', 'प्रकार की सामान्य जानकारी');
      y = T.keyValueGrid(doc, X, y, CW, [
        ['Manufacturer', inst.manufacturer],
        ['Model / type designation', inst.model, { bold: true }],
        ['Category', T.TYPE_LABEL[inst.type] || inst.type],
        ['Serial no. of test sample', inst.serialNumber, { mono: true }],
        ['Accuracy class', T.classLabel(inst.accuracyClass), { bold: true }],
        ['Max / Min', `${fmt(inst.maxCapacity)} / ${fmt(inst.minCapacity)} ${unit}`],
        ['e / d', `${inst.verificationInterval} / ${inst.actualInterval || inst.verificationInterval} ${unit}`],
        ['n = Max / e', n ? n.toLocaleString('en-IN') : '—'],
      ]);
      y += 4;

      // ---- 2. Test equipment and conditions ----
      y = T.sectionBar(doc, X, y, CW, '2. Test equipment and conditions', 'R 76-2 §2–3 · GUM / EURAMET cg-18', 'परीक्षण उपकरण एवं परिस्थितियाँ');
      y = T.keyValueGrid(doc, X, y, CW, [
        ['Ambient temperature', session.temperature != null ? `${session.temperature} °C` : 'Not recorded'],
        ['Relative humidity', session.humidity != null ? `${session.humidity} % RH` : 'Not recorded'],
        ['Barometric pressure', session.atmosphericPressure != null ? `${session.atmosphericPressure} hPa` : 'Not recorded'],
        ['Expanded uncertainty (lab)', `U = ±${fmt(budget.expandedUncertainty, false)} ${unit} at Max (k = 2)`],
      ]);
      doc.rect(X, y, CW, 14.5).fill('#FFFFFF').lineWidth(0.6).strokeColor(C.LINE).stroke();
      doc.fillColor(C.MUTED).font('Helvetica-Bold').fontSize(6.6).text('Standards used', X + 5, y + 4.3);
      doc.fillColor(C.TEXT).font('Helvetica').fontSize(7).text(session.standardWeightsUsed || 'Not recorded', X + CW * 0.19 + 5, y + 4.2, { width: CW * 0.8, height: 9, ellipsis: true });
      y += 20;

      // ---- 3. Summary of the type evaluation ----
      y = T.sectionBar(doc, X, y, CW, '3. Summary of the type evaluation', 'Initial-verification MPE (1×)', 'मूल्यांकन सारांश');
      const tests = T.TESTS.filter((t) => TYPE_EVALUATION_TEST_TYPES.includes(t.type));
      const rows = tests.map((t, i) => {
        const r = results[t.type];
        const v = r?.result || 'N/A';
        return [
          String(i + 1),
          { text: t.en, bold: true },
          t.clause,
          keyFinding(t.type, r, fmt, unit, lim),
          { text: v, bold: true, color: v === 'PASS' ? C.PASS : v === 'FAIL' ? C.FAIL : C.FAINT, bg: v === 'PASS' ? C.PASS_BG : v === 'FAIL' ? C.FAIL_BG : null, align: 'center' },
        ];
      });
      y = T.table(doc, X, y, [
        { label: '#', width: 18, align: 'center' },
        { label: 'TEST', width: 140 },
        { label: 'CLAUSE', width: 62 },
        { label: 'KEY FINDING (from recorded readings)', width: CW - 18 - 140 - 62 - 46 },
        { label: 'RESULT', width: 46, align: 'center' },
      ], rows, { fontSize: 6.9, rowHeight: 14 });
      y += 8;

      // ---- 4. Tests not covered ----
      y = T.sectionBar(doc, X, y, CW, '4. R 76-2 tests not covered by this report', 'to be recorded by the laboratory', 'इस रिपोर्ट में शामिल नहीं');
      const half = Math.ceil(NOT_COVERED.length / 2);
      const colW = CW / 2;
      const rowH = 11;
      doc.rect(X, y, CW, half * rowH + 6).fill(C.BG);
      NOT_COVERED.forEach(([name, clause], i) => {
        const cx = X + (i < half ? 0 : colW) + 6;
        const cy = y + 4 + (i % half) * rowH;
        doc.fillColor(C.TEXT).font('Helvetica').fontSize(6.9).text(`${name}`, cx, cy, { width: colW - 112, height: 9, lineBreak: false, ellipsis: true });
        doc.fillColor(C.FAINT).font('Helvetica-Bold').fontSize(6.2).text(`${clause}  NOT TESTED`, cx + colW - 112, cy + 0.5, { width: 100, align: 'right', lineBreak: false });
      });
      y += half * rowH + 12;

      // ---- 5. Conclusion ----
      const vh = 40;
      doc.roundedRect(X, y, CW, vh, 4).fill(pass ? C.PASS_BG : C.FAIL_BG);
      doc.rect(X, y, 5, vh).fill(pass ? C.PASS : C.FAIL);
      doc.fillColor(pass ? C.PASS : C.FAIL).font('Helvetica-Bold').fontSize(9.6)
        .text(
          pass ? 'TEST SAMPLE MEETS THE REQUIREMENTS OF ALL TESTS IN SECTION 3' : 'TEST SAMPLE FAILS ONE OR MORE TESTS IN SECTION 3',
          X + 14, y + 8, { width: CW - 26, lineBreak: false, ellipsis: true }
        );
      doc.fillColor(C.TEXT).font('Helvetica').fontSize(6.9).text(
        'This report records test results only. It is not a certificate of approval: the model approval decision rests with the competent authority after all applicable R 76 tests and the examination are complete.',
        X + 14, y + 22, { width: CW - 26 }
      );
      y += vh + 8;

      if (session.remarks) {
        doc.fillColor(C.MUTED).font('Helvetica-Bold').fontSize(6.6).text('REMARKS OF THE EVALUATOR', X, y);
        doc.fillColor(C.TEXT).font('Helvetica').fontSize(7).text(session.remarks, X, y + 9, { width: CW, height: 26, ellipsis: true });
        y = Math.min(doc.y, y + 36) + 6;
      }

      // ---- Signatures ----
      const by = Math.max(y + 2, H - M - 118);
      const sw2 = CW / 2;
      doc.fillColor(C.MUTED).font('Helvetica-Bold').fontSize(6.6).text('TESTED BY', X, by);
      doc.fillColor(C.INDIA_BLUE).font('Helvetica-BoldOblique').fontSize(11).text(officer.name || '—', X, by + 14, { width: sw2 - 20 });
      doc.moveTo(X, by + 30).lineTo(X + sw2 - 30, by + 30).lineWidth(0.5).strokeColor(C.LINE).stroke();
      doc.fillColor(C.MUTED).font('Helvetica').fontSize(6.6)
        .text(`${officer.designation || 'Evaluating officer'} · sealed ${T.formatDate(session.sealedAt || testedAt, true)}`, X, by + 34, { width: sw2 - 20 });
      doc.fillColor(C.MUTED).font('Helvetica-Bold').fontSize(6.6).text('REVIEWED / APPROVED BY (competent authority)', X + sw2, by);
      doc.moveTo(X + sw2, by + 30).lineTo(X + CW, by + 30).lineWidth(0.5).strokeColor(C.LINE).stroke();
      doc.fillColor(C.MUTED).font('Helvetica').fontSize(6.6).text('Name, designation, date', X + sw2, by + 34, { width: sw2 });

      doc.fillColor(C.FAINT).font('Helvetica').fontSize(6.4).text(
        `Annex: detailed test forms (every reading, error and limit) are in the Technical Data Sheet generated from the same sealed readings. Limits applied: ${ruleSetLabel(session)}. Photographs and documents on file: ${(session.attachments || []).length}.`,
        X, by + 52, { width: CW }
      );

      // ---- Footer: seal ----
      const fy = H - M - 46;
      doc.rect(X, fy, CW, 24).fill(C.BG);
      doc.fillColor(C.MUTED).font('Helvetica-Bold').fontSize(6).text('HMAC-SHA256 TAMPER-EVIDENT SEAL (readings, results and instrument particulars)', X + 6, fy + 4);
      doc.fillColor(C.NAVY).font('Courier').fontSize(7).text(session.verificationSeal || 'UNSEALED', X + 6, fy + 13, { width: CW - 12, lineBreak: false });
      doc.fillColor(C.FAINT).font('Helvetica').fontSize(5.6)
        .text(`Authenticity can be confirmed at ${verifyUrl.split('?')[0]} — any alteration invalidates the seal. Generated by NAWI-ReportPro.`, X, fy + 28, { width: CW, align: 'center', lineBreak: false });
      T.tricolor(doc, M + 4, H - M - 10.6, W - 2 * M - 8, 2.2);

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

module.exports = { generateTypeEvaluationReport, NOT_COVERED, ruleSetLabel };
