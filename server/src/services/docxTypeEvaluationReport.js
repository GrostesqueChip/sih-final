/**
 * OIML R 76 Type Evaluation Test Report as an editable Word document (.docx).
 *
 * Same sections and the same stored, sealed figures as the PDF report
 * (pdfTypeEvaluationReport.js). The sealed PDF remains the official record;
 * this file is an editable copy for the laboratory's own remarks and review,
 * and says so on its first line.
 */
const {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  WidthType,
  AlignmentType,
  HeadingLevel,
  BorderStyle,
  ShadingType,
} = require('docx');
const T = require('./pdfTheme');
const { computeExpandedUncertainty } = require('./uncertaintyCalculator');
const { TYPE_EVALUATION_TEST_TYPES } = require('../lib/sessionTypes');
const { NOT_COVERED, ruleSetLabel } = require('./pdfTypeEvaluationReport');

const NAVY = '1F3A5F';
const LINE = { style: BorderStyle.SINGLE, size: 4, color: 'B8C4D6' };
const BORDERS = { top: LINE, bottom: LINE, left: LINE, right: LINE };
const FONT = 'Calibri';
const HINDI_FONT = 'Nirmala UI';

const run = (text, opts = {}) => new TextRun({ text: String(text ?? '—'), font: FONT, size: 20, ...opts });
const para = (children, opts = {}) => new Paragraph({ children: Array.isArray(children) ? children : [children], spacing: { after: 60 }, ...opts });

function cell(content, { bold = false, fill, width, align, color } = {}) {
  const runs = Array.isArray(content) ? content : [run(content, { bold, color })];
  return new TableCell({
    children: [new Paragraph({ children: runs, alignment: align })],
    borders: BORDERS,
    width: width ? { size: width, type: WidthType.PERCENTAGE } : undefined,
    shading: fill ? { type: ShadingType.CLEAR, color: 'auto', fill } : undefined,
    margins: { top: 50, bottom: 50, left: 90, right: 90 },
  });
}

const table = (rows) => new Table({ rows, width: { size: 100, type: WidthType.PERCENTAGE } });

function heading(en, hi) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 220, after: 90 },
    children: [
      new TextRun({ text: en, font: FONT, bold: true, size: 24, color: NAVY }),
      ...(hi ? [new TextRun({ text: `   ${hi}`, font: HINDI_FONT, size: 20, color: '5B6B80' })] : []),
    ],
  });
}

/** Two label / value pairs per row, as in the PDF's key-value grid. */
function keyValueTable(pairs) {
  const rows = [];
  for (let i = 0; i < pairs.length; i += 2) {
    const cells = [];
    for (const [k, v] of [pairs[i], pairs[i + 1] || ['', '']]) {
      cells.push(cell(k, { bold: true, fill: 'EEF3FA', width: 22 }), cell(v == null || v === '' ? '—' : v, { width: 28 }));
    }
    rows.push(new TableRow({ children: cells }));
  }
  return table(rows);
}

async function generateTypeEvaluationDocx(sessionData) {
  // Lazy require, as in the PDF module: pdfCertificate requires the PDF report for dispatch.
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
  const verifyUrl = T.verifyUrlFor(session).split('?')[0];
  const n = inst.maxCapacity && e ? Math.round(Number(inst.maxCapacity) / e) : null;

  const tests = T.TESTS.filter((t) => TYPE_EVALUATION_TEST_TYPES.includes(t.type));
  const summaryRows = [
    new TableRow({
      tableHeader: true,
      children: ['#', 'Test', 'Clause', 'Key finding (from recorded readings)', 'Result'].map((h, i) =>
        cell([run(h, { bold: true, color: 'FFFFFF' })], { fill: NAVY, width: [5, 27, 13, 43, 12][i] })
      ),
    }),
    ...tests.map((t, i) => {
      const r = results[t.type];
      const v = r?.result || 'N/A';
      return new TableRow({
        children: [
          cell(String(i + 1), { align: AlignmentType.CENTER }),
          cell(t.en, { bold: true }),
          cell(t.clause),
          cell(keyFinding(t.type, r, fmt, unit, lim)),
          cell(v, { bold: true, align: AlignmentType.CENTER, fill: v === 'PASS' ? 'E3F4E8' : v === 'FAIL' ? 'FBE6E3' : undefined, color: v === 'PASS' ? '14713A' : v === 'FAIL' ? 'A52A1E' : undefined }),
        ],
      });
    }),
  ];

  const notCoveredRows = [
    new TableRow({
      tableHeader: true,
      children: ['R 76-2 test', 'Clause', 'Status'].map((h, i) => cell([run(h, { bold: true, color: 'FFFFFF' })], { fill: NAVY, width: [60, 20, 20][i] })),
    }),
    ...NOT_COVERED.map(([name, clause]) => new TableRow({ children: [cell(name), cell(clause), cell('NOT TESTED', { color: '5B6B80' })] })),
  ];

  const doc = new Document({
    creator: 'NAWI-ReportPro',
    title: `OIML R 76 Type Evaluation Test Report ${session.certificateNo || ''}`,
    description: 'Editable copy of the OIML R 76 type evaluation test report. The sealed PDF is the official record.',
    styles: { default: { document: { run: { font: FONT, size: 20 } } } },
    sections: [
      {
        properties: { page: { margin: { top: 900, bottom: 900, left: 1000, right: 1000 } } },
        children: [
          para(run('EDITABLE COPY. The sealed PDF report is the official record; any change made here is not covered by the seal.', { bold: true, color: 'A52A1E', size: 18 }), {
            alignment: AlignmentType.CENTER,
            border: { top: LINE, bottom: LINE, left: LINE, right: LINE },
          }),
          para(run('GOVERNMENT OF INDIA · DEPARTMENT OF CONSUMER AFFAIRS', { bold: true, color: NAVY }), { alignment: AlignmentType.CENTER, spacing: { before: 160, after: 0 } }),
          para(run('Legal Metrology Division · Designated laboratory for model approval', { size: 18, color: '5B6B80' }), { alignment: AlignmentType.CENTER }),
          para(new TextRun({ text: 'प्रकार मूल्यांकन परीक्षण रिपोर्ट', font: HINDI_FONT, size: 26, color: NAVY, bold: true }), { alignment: AlignmentType.CENTER, spacing: { before: 120, after: 0 } }),
          new Paragraph({
            heading: HeadingLevel.HEADING_1,
            alignment: AlignmentType.CENTER,
            spacing: { after: 60 },
            children: [new TextRun({ text: 'OIML R 76 TYPE EVALUATION TEST REPORT', font: FONT, bold: true, size: 32, color: NAVY })],
          }),
          para(
            run('Non-automatic weighing instrument · structured after the OIML R 76-2:2007 test report format · prepared for model approval under the Legal Metrology (Approval of Models) Rules, 2011.', {
              italics: true,
              size: 17,
              color: '5B6B80',
            }),
            { alignment: AlignmentType.CENTER, spacing: { after: 160 } }
          ),

          table([
            new TableRow({
              children: [
                cell('Report no.', { bold: true, fill: 'EEF3FA', width: 14 }),
                cell(session.certificateNo || '—', { bold: true, width: 22 }),
                cell('Date of tests', { bold: true, fill: 'EEF3FA', width: 14 }),
                cell(T.formatDate(session.startedAt || testedAt), { width: 18 }),
                cell('Summary', { bold: true, fill: 'EEF3FA', width: 12 }),
                cell(pass ? 'ALL TESTS PASSED' : verdict === 'FAIL' ? 'ONE OR MORE FAILED' : '—', { bold: true, width: 20, color: pass ? '14713A' : 'A52A1E' }),
              ],
            }),
          ]),

          heading('1. General information on the type', 'प्रकार की सामान्य जानकारी'),
          keyValueTable([
            ['Manufacturer', inst.manufacturer],
            ['Model / type designation', inst.model],
            ['Category', T.TYPE_LABEL[inst.type] || inst.type],
            ['Serial no. of test sample', inst.serialNumber],
            ['Accuracy class', T.classLabel(inst.accuracyClass)],
            ['Max / Min', `${fmt(inst.maxCapacity)} / ${fmt(inst.minCapacity)} ${unit}`],
            ['e / d', `${inst.verificationInterval} / ${inst.actualInterval || inst.verificationInterval} ${unit}`],
            ['n = Max / e', n ? n.toLocaleString('en-IN') : '—'],
          ]),

          heading('2. Test equipment and conditions', 'परीक्षण उपकरण एवं परिस्थितियाँ'),
          keyValueTable([
            ['Ambient temperature', session.temperature != null ? `${session.temperature} °C` : 'Not recorded'],
            ['Relative humidity', session.humidity != null ? `${session.humidity} % RH` : 'Not recorded'],
            ['Barometric pressure', session.atmosphericPressure != null ? `${session.atmosphericPressure} hPa` : 'Not recorded'],
            ['Expanded uncertainty (lab)', `U = ±${fmt(budget.expandedUncertainty, false)} ${unit} at Max (k = 2)`],
            ['Standards used', session.standardWeightsUsed || 'Not recorded'],
          ]),

          heading('3. Summary of the type evaluation', 'मूल्यांकन सारांश'),
          table(summaryRows),

          heading('4. R 76-2 tests not covered by this report', 'इस रिपोर्ट में शामिल नहीं'),
          table(notCoveredRows),

          heading('5. Conclusion'),
          para(run(pass ? 'Test sample meets the requirements of all tests in section 3.' : verdict === 'FAIL' ? 'Test sample fails one or more tests in section 3.' : 'No conclusion recorded.', { bold: true, color: pass ? '14713A' : 'A52A1E' })),
          para(
            run('This report records test results only. It is not a certificate of approval: the model approval decision rests with the competent authority after all applicable R 76 tests and the examination are complete.')
          ),
          para([run('Remarks of the evaluator: ', { bold: true }), run(session.remarks || '')], { spacing: { before: 120, after: 200 } }),

          table([
            new TableRow({
              children: [cell('Tested by', { bold: true, fill: 'EEF3FA', width: 50 }), cell('Reviewed / approved by (competent authority)', { bold: true, fill: 'EEF3FA', width: 50 })],
            }),
            new TableRow({
              children: [
                cell([run(officer.name || '—', { bold: true }), run(`\n${officer.designation || 'Evaluating officer'} · sealed ${T.formatDate(session.sealedAt || testedAt, true)}`, { break: 1, size: 18 })]),
                cell([run('Name, designation, date', { color: '8A97A8' }), run(' ', { break: 2 })]),
              ],
            }),
          ]),

          para(run('HMAC-SHA256 tamper-evident seal of the official record (readings, results and instrument particulars):', { bold: true, size: 17 }), { spacing: { before: 220, after: 20 } }),
          para(new TextRun({ text: session.verificationSeal || 'UNSEALED', font: 'Consolas', size: 16, color: NAVY })),
          para(run(`The official record can be checked at ${verifyUrl}. Annex: every reading, error and limit is in the Technical Data Sheet generated from the same sealed readings. Limits applied: ${ruleSetLabel(session)}. Generated by NAWI-ReportPro.`, { size: 16, color: '5B6B80' })),
        ],
      },
    ],
  });

  return Packer.toBuffer(doc);
}

module.exports = { generateTypeEvaluationDocx };
