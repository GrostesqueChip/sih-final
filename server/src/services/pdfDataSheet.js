/**
 * Technical Data Sheet — the full measurement record behind a certificate.
 *
 * Continuous-flow layout (sections break across pages only when needed), every
 * table built from the raw readings and the stored OIML R-76 calculations.
 * Modules that were never recorded are shown as "Not recorded", never as PASS.
 */
const fs = require('fs');
const PDFDocument = require('pdfkit');
const { computeExpandedUncertainty } = require('./uncertaintyCalculator');
const { calculateMultiIntervalMPE } = require('./mpeCalculator');
const { keyFinding } = require('./pdfCertificate');
const T = require('./pdfTheme');

const { C } = T;

function verdictCell(v) {
  if (v === true || v === 'PASS') return { text: 'PASS', bold: true, color: C.PASS, align: 'center' };
  if (v === false || v === 'FAIL') return { text: 'FAIL', bold: true, color: C.FAIL, bg: C.FAIL_BG, align: 'center' };
  return { text: '—', color: C.FAINT, align: 'center' };
}

async function generateDataSheet(sessionData) {
  const session = sessionData || {};
  const inst = session.instrument || {};
  const officer = session.conductedBy || {};
  const results = Object.fromEntries((session.testResults || []).map((r) => [r.testType, r]));
  const unit = inst.unit || 'kg';
  const fmt = T.numFmt(inst);
  const fmt2 = T.numFmt(inst, 1);
  const e = Number(inst.verificationInterval || 1);
  const inService = session.verificationType === 'INSPECTION';
  const mpeAt = (load) => calculateMultiIntervalMPE(load, inst.accuracyClass, [{ max: Infinity, e }], inService).mpe;
  const verifyUrl = T.verifyUrlFor(session);
  const qr = await T.qrPng(verifyUrl, 200);

  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        bufferPages: true,
        margins: { top: 0, bottom: 0, left: 0, right: 0 },
        info: {
          Title: `Technical Data Sheet ${session.certificateNo}`,
          Author: 'Department of Legal Metrology, Punjab',
          Creator: 'NAWI-ReportPro',
        },
      });
      T.registerFonts(doc);
      const chunks = [];
      doc.on('data', (c) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));

      const W = doc.page.width;
      const H = doc.page.height;
      const X = 40;
      const CW = W - 2 * X;
      const TOP = 58;
      const BOTTOM = H - 44;
      let y = 0;

      const runningHeader = () => {
        T.tricolor(doc, 0, 0, W, 2.4);
        if (fs.existsSync(T.EMBLEM)) doc.image(T.EMBLEM, X, 14, { height: 30 });
        doc.fillColor(C.NAVY).font('Helvetica-Bold').fontSize(8.2).text('DEPARTMENT OF LEGAL METROLOGY', X + 26, 18);
        doc.fillColor(C.MUTED).font('Helvetica').fontSize(6.6).text('Technical Data Sheet — OIML R 76 verification record', X + 26, 29);
        doc.fillColor(C.NAVY).font('Courier-Bold').fontSize(8.5).text(session.certificateNo || '', X, 18, { width: CW, align: 'right' });
        doc.fillColor(C.MUTED).font('Helvetica').fontSize(6.6).text(inst.name || '', X, 29, { width: CW, align: 'right' });
        doc.moveTo(X, 48).lineTo(X + CW, 48).lineWidth(0.5).strokeColor(C.LINE).stroke();
      };
      const newPage = () => {
        doc.addPage({ size: 'A4', margins: { top: 0, bottom: 0, left: 0, right: 0 } });
        runningHeader();
        y = TOP;
      };
      const ensure = (h) => {
        if (y + h > BOTTOM) newPage();
      };

      // ================= Page 1 cover =================
      T.tricolor(doc, 0, 0, W, 2.6);
      if (fs.existsSync(T.EMBLEM)) doc.image(T.EMBLEM, X, 22, { height: 58 });
      doc.fontSize(9).fillColor(C.TEXT);
      T.hindi(doc, 'विधिक माप विज्ञान विभाग, पंजाब', X + 46, 26, {}, true);
      doc.font('Helvetica-Bold').fontSize(11).fillColor(C.NAVY).text('DEPARTMENT OF LEGAL METROLOGY, PUNJAB', X + 46, 42);
      doc.font('Helvetica').fontSize(7).fillColor(C.MUTED).text('Ministry of Consumer Affairs, Food & Public Distribution  •  Government of India', X + 46, 56);
      doc.image(qr, X + CW - 62, 20, { width: 62 });
      y = 92;
      doc.rect(X, y, CW, 38).fill(C.NAVY);
      doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(14).text('TECHNICAL DATA SHEET', X + 12, y + 8);
      doc.fillColor('#BFD2EA').font('Helvetica').fontSize(7.2).text('Detailed record of measurements and OIML R 76-1:2006 evaluations', X + 12, y + 25);
      doc.fillColor('#FFFFFF').font('Courier-Bold').fontSize(11).text(session.certificateNo || '—', X, y + 9, { width: CW - 12, align: 'right' });
      const v = session.overallResult;
      doc.fillColor(v === 'PASS' ? '#86EFAC' : '#FCA5A5').font('Helvetica-Bold').fontSize(8)
        .text(v === 'PASS' ? 'OVERALL: CONFORMS (PASS)' : v === 'FAIL' ? 'OVERALL: DOES NOT CONFORM (FAIL)' : 'OVERALL: NOT FINALIZED', X, y + 25, { width: CW - 12, align: 'right' });
      y += 48;

      y = T.sectionBar(doc, X, y, CW, 'A. Instrument', null, 'उपकरण');
      y = T.keyValueGrid(doc, X, y, CW, [
        ['Instrument', inst.name, { bold: true }],
        ['Category', T.TYPE_LABEL[inst.type] || inst.type],
        ['Manufacturer', inst.manufacturer],
        ['Model', inst.model],
        ['Serial number', inst.serialNumber, { mono: true }],
        ['Accuracy class', T.classLabel(inst.accuracyClass), { bold: true }],
        ['Max / Min', `${fmt(inst.maxCapacity)} / ${fmt(inst.minCapacity)} ${unit}`],
        ['e / d', `${inst.verificationInterval} / ${inst.actualInterval || inst.verificationInterval} ${unit}`],
        ['n = Max / e', Math.round(Number(inst.maxCapacity) / e).toLocaleString('en-IN')],
        ['Owner / user', inst.ownerName],
        ['Location', inst.location],
        ['District', inst.district],
      ]);
      y += 8;
      y = T.sectionBar(doc, X, y, CW, 'B. Verification session', null, 'सत्यापन सत्र');
      y = T.keyValueGrid(doc, X, y, CW, [
        ['Verification type', T.VERIFICATION_TYPE_LABEL[session.verificationType] || '—'],
        ['MPE basis', inService ? 'In-service (2 × MPE, R 76-1 3.5.2)' : 'Verification (1 × MPE, R 76-1 3.5.1)'],
        ['Started', T.formatDate(session.startedAt, true)],
        ['Finalized & sealed', T.formatDate(session.completedAt || session.sealedAt, true)],
        ['Verifying officer', officer.name],
        ['Designation', officer.designation || (officer.role === 'ADMIN' ? 'Controller of Legal Metrology' : 'Inspector of Legal Metrology')],
        ['Temperature / RH', `${session.temperature ?? '—'} °C / ${session.humidity ?? '—'} % RH`],
        ['Pressure', session.atmosphericPressure != null ? `${session.atmosphericPressure} hPa` : 'Not recorded'],
      ]);
      doc.rect(X, y, CW, 14.5).fill('#FFFFFF').lineWidth(0.6).strokeColor(C.LINE).stroke();
      doc.fillColor(C.MUTED).font('Helvetica-Bold').fontSize(6.6).text('Standards used', X + 5, y + 4.3);
      doc.fillColor(C.TEXT).font('Helvetica').fontSize(7).text(session.standardWeightsUsed || 'Not recorded', X + CW * 0.19 + 5, y + 4.2, { width: CW * 0.8, height: 9, ellipsis: true });
      y += 22;

      // Summary matrix
      y = T.sectionBar(doc, X, y, CW, 'C. Summary of results', 'OIML R 76-1:2006', 'परिणाम सारांश');
      y = T.table(doc, X, y, [
        { label: '#', width: 18, align: 'center' },
        { label: 'TEST MODULE', width: 160 },
        { label: 'CLAUSE', width: 60 },
        { label: 'KEY FINDING', width: CW - 18 - 160 - 60 - 46 },
        { label: 'RESULT', width: 46, align: 'center' },
      ], T.TESTS.map((t, i) => [
        String(i + 1),
        { text: t.en, bold: true },
        t.clause,
        results[t.type] ? keyFinding(t.type, results[t.type], fmt, unit) : 'Not recorded',
        verdictCell(results[t.type]?.result),
      ]), { fontSize: 7, rowHeight: 14 });
      y += 10;

      // Uncertainty budget
      const rep = results.REPEATABILITY?.calculations;
      const ecc = results.ECCENTRICITY?.calculations;
      const budget = computeExpandedUncertainty(rep?.maxStdDev || 0, Number(inst.actualInterval || e), Number(inst.maxCapacity || 0), inst.accuracyClass, {
        eccError: ecc?.maxDifferenceFromCenter || 0,
        ranges: inst.ranges,
      });
      ensure(120);
      y = T.sectionBar(doc, X, y, CW, 'D. Measurement uncertainty budget at Max', 'ISO/IEC GUM · EURAMET cg-18', 'अनिश्चितता');
      const comp = budget.components || {};
      const uRows = [
        ['Repeatability (Type A)', 'Normal', fmt2(comp.repeatability)],
        ['Resolution of indication', 'Rectangular', fmt2(comp.resolution)],
        ['Reference standard weights', 'Rectangular', fmt2(comp.standardWeights)],
        ['Eccentricity', 'Rectangular', fmt2(comp.eccentricity)],
        ['Temperature', 'Rectangular', fmt2(comp.temperature)],
        [{ text: 'Combined standard uncertainty u(c)', bold: true }, '—', { text: fmt2(budget.combinedStandardUncertainty), bold: true }],
        [{ text: 'Expanded uncertainty U (k = 2, ~95 %)', bold: true, color: C.NAVY }, '—', { text: `± ${fmt2(budget.expandedUncertainty)}`, bold: true, color: C.NAVY }],
      ];
      y = T.table(doc, X, y, [
        { label: 'COMPONENT', width: CW * 0.55 },
        { label: 'DISTRIBUTION', width: CW * 0.2 },
        { label: `STANDARD UNCERTAINTY (${unit})`, width: CW * 0.25, align: 'right' },
      ], uRows, { fontSize: 7.2 });
      y += 12;

      // ================= Module sections =================
      const moduleHeader = (idx, title, ref, hi, verdict) => {
        ensure(70);
        y = T.sectionBar(doc, X, y, CW, `${idx}. ${title}`, ref, hi, verdict ? 58 : 8);
        if (verdict) T.pill(doc, X + CW - 50, y - 14.5, verdict);
        y += 4;
      };
      const summaryLine = (text, verdict) => {
        ensure(18);
        doc.rect(X, y, CW, 15).fill(verdict === 'FAIL' ? C.FAIL_BG : verdict === 'PASS' ? C.PASS_BG : C.BG);
        doc.fillColor(verdict === 'FAIL' ? C.FAIL : verdict === 'PASS' ? C.PASS : C.MUTED).font('Helvetica-Bold').fontSize(7.2)
          .text(text, X + 6, y + 4.2, { width: CW - 12, height: 9, ellipsis: true });
        y += 24;
      };
      const notRecorded = () => {
        doc.fillColor(C.FAINT).font('Helvetica-Oblique').fontSize(7.5).text('No readings recorded for this module.', X + 4, y + 2);
        y += 20;
      };

      // 1. Weighing performance + chart
      {
        const r = results.WEIGHING_PERFORMANCE;
        moduleHeader(1, 'Weighing performance', 'R 76-1 A.4.4 · Ec = E − E0', 'तौल निष्पादन', r?.result);
        const pts = r?.calculations?.points || [];
        if (!pts.length) notRecorded();
        else {
          const loads = [...new Set(pts.map((p) => p.appliedLoad))].sort((a, b) => a - b);
          const hyst = r.calculations.hysteresisAnalysis?.evaluations || [];
          const rows = loads.map((L) => {
            const inc = pts.find((p) => p.appliedLoad === L && p.isIncreasing);
            const dec = pts.find((p) => p.appliedLoad === L && !p.isIncreasing);
            const h = hyst.find((x) => Math.abs(x.appliedLoad - L) < 1e-9);
            const ok = (inc?.passed ?? true) && (dec?.passed ?? true) && (h?.passed ?? true);
            return [
              { text: fmt(L), bold: true },
              `${Math.round((L / inst.maxCapacity) * 100)} %`,
              fmt(inc?.indicatedValue),
              { text: fmt(inc?.correctedError, true), color: inc && !inc.passed ? C.FAIL : C.TEXT },
              fmt(dec?.indicatedValue),
              { text: fmt(dec?.correctedError, true), color: dec && !dec.passed ? C.FAIL : C.TEXT },
              fmt(h?.hysteresis),
              `± ${fmt(inc?.mpeMass ?? mpeAt(L))}`,
              verdictCell(ok),
            ];
          });
          ensure(20 + rows.length * 13);
          const cw = CW / 9;
          y = T.table(doc, X, y, [
            { label: `LOAD (${unit})`, width: cw * 1.15, align: 'right' },
            { label: '% MAX', width: cw * 0.7, align: 'right' },
            { label: 'IND. ▲', width: cw * 1.1, align: 'right' },
            { label: 'Ec ▲', width: cw, align: 'right' },
            { label: 'IND. ▼', width: cw * 1.1, align: 'right' },
            { label: 'Ec ▼', width: cw, align: 'right' },
            { label: 'HYSTERESIS', width: cw, align: 'right' },
            { label: 'MPE', width: cw, align: 'right' },
            { label: 'RESULT', width: cw * 0.95, align: 'center' },
          ].map((c) => ({ ...c, label: c.label.replace('▲', '(up)').replace('▼', '(down)') })), rows, { fontSize: 7 });
          y += 8;

          // Error envelope chart
          ensure(170);
          const gx = X + 44;
          const gw = CW - 60;
          const gh = 130;
          const gy = y + 8;
          const maxMpe = Math.max(...loads.map((L) => mpeAt(L)));
          const maxErr = Math.max(...pts.map((p) => Math.abs(p.correctedError || 0)));
          const yMax = Math.max(maxMpe, maxErr) * 1.35 || 1;
          const sx = (L) => gx + (L / inst.maxCapacity) * gw;
          const sy = (err) => gy + gh / 2 - (err / yMax) * (gh / 2);
          doc.rect(gx, gy, gw, gh).fill('#FBFDFF');
          // envelope (stepped)
          const steps = 60;
          const upper = [];
          for (let i = 0; i <= steps; i += 1) {
            const L = (inst.maxCapacity * i) / steps;
            upper.push([sx(L), sy(mpeAt(L))]);
          }
          const lower = upper.map(([px], i) => [px, sy(-mpeAt((inst.maxCapacity * i) / steps))]);
          doc.save();
          doc.polygon(...upper, ...lower.reverse()).fillOpacity(0.12).fill(C.PASS);
          doc.restore();
          doc.save();

          doc.moveTo(...upper[0]);
          upper.forEach((p) => doc.lineTo(...p));
          doc.lineWidth(0.9).dash(3, { space: 2 }).strokeColor(C.PASS).stroke();
          doc.moveTo(...lower[lower.length - 1]);
          [...lower].reverse().forEach((p) => doc.lineTo(...p));
          doc.stroke();
          doc.undash();
          doc.restore();
          // axes
          doc.moveTo(gx, sy(0)).lineTo(gx + gw, sy(0)).lineWidth(0.5).strokeColor('#94A3B8').stroke();
          doc.rect(gx, gy, gw, gh).lineWidth(0.5).strokeColor(C.LINE).stroke();
          doc.fillColor(C.FAINT).font('Helvetica').fontSize(6);
          [yMax, yMax / 2, 0, -yMax / 2, -yMax].forEach((val) => doc.text(fmt2(val, true), X - 4, sy(val) - 3, { width: 46, align: 'right' }));
          [0, 0.25, 0.5, 0.75, 1].forEach((f) => doc.text(fmt(inst.maxCapacity * f), sx(inst.maxCapacity * f) - 25, gy + gh + 3, { width: 50, align: 'center' }));
          // series
          const series = (inc, color) => {
            const s = pts.filter((p) => p.isIncreasing === inc).sort((a, b) => a.appliedLoad - b.appliedLoad);
            if (!s.length) return;
            doc.moveTo(sx(s[0].appliedLoad), sy(s[0].correctedError));
            s.forEach((p) => doc.lineTo(sx(p.appliedLoad), sy(p.correctedError)));
            doc.lineWidth(1.3).strokeColor(color).stroke();
            s.forEach((p) => {
              doc.circle(sx(p.appliedLoad), sy(p.correctedError), 2.3).fill(p.passed ? color : C.FAIL);
            });
          };
          series(true, '#1D4ED8');
          series(false, '#EA580C');
          doc.fillColor(C.MUTED).font('Helvetica-Bold').fontSize(6.4).text(`Applied load (${unit})`, gx, gy + gh + 12, { width: gw, align: 'center' });
          // legend
          const lx = gx + 6;
          const ly = gy + 6;
          doc.rect(lx, ly, 150, 30).fill('#FFFFFF').lineWidth(0.4).strokeColor(C.LINE).stroke();
          doc.circle(lx + 8, ly + 8, 2.3).fill('#1D4ED8');
          doc.fillColor(C.TEXT).font('Helvetica').fontSize(6.2).text('Increasing load (Ec)', lx + 14, ly + 5.5);
          doc.circle(lx + 8, ly + 17, 2.3).fill('#EA580C');
          doc.fillColor(C.TEXT).text('Decreasing load (Ec)', lx + 14, ly + 14.5);
          doc.rect(lx + 5, ly + 23, 7, 4).fill('#CDE9D6');
          doc.fillColor(C.TEXT).text('± MPE envelope (stepped)', lx + 14, ly + 22.5);
          y = gy + gh + 26;
        }
        summaryLine(r?.calculations?.summary || 'Not recorded', r?.result);
      }

      // 2. Repeatability
      {
        const r = results.REPEATABILITY;
        moduleHeader(2, 'Repeatability', 'R 76-1 A.4.10 · max − min ≤ |MPE|', 'पुनरावृत्ति', r?.result);
        const series = r?.calculations?.series || [];
        if (!series.length) notRecorded();
        else {
          const n = Math.max(...series.map((s) => s.readings.length));
          const cols = [{ label: `LOAD (${unit})`, width: 62, align: 'right' }];
          for (let i = 0; i < n; i += 1) cols.push({ label: `RUN ${i + 1}`, width: (CW - 62 - 3 * 50 - 44) / n, align: 'right' });
          cols.push({ label: 'RANGE', width: 50, align: 'right' }, { label: 'STD DEV', width: 50, align: 'right' }, { label: 'MPE', width: 50, align: 'right' }, { label: 'RESULT', width: 44, align: 'center' });
          y = T.table(doc, X, y, cols, series.map((s) => [
            { text: fmt(s.load), bold: true },
            ...Array.from({ length: n }, (_, i) => fmt(s.readings[i])),
            { text: fmt(s.range), color: s.passed ? C.TEXT : C.FAIL, bold: !s.passed },
            fmt2(s.stdDev),
            `± ${fmt(s.mpeMass)}`,
            verdictCell(s.passed),
          ]), { fontSize: 7 });
          y += 6;
        }
        summaryLine(r?.calculations?.summary || 'Not recorded', r?.result);
      }

      // 3. Eccentricity
      {
        const r = results.ECCENTRICITY;
        moduleHeader(3, 'Eccentricity (off-centre loading)', 'R 76-1 A.4.7 · load ≈ Max/3', 'विकेंद्रता', r?.result);
        const pos = r?.calculations?.positions || [];
        if (!pos.length) notRecorded();
        else {
          const names = { CENTER: 'Centre', POS_2: 'Front-left', POS_3: 'Front-right', POS_4: 'Back-right', POS_5: 'Back-left' };
          y = T.table(doc, X, y, [
            { label: 'POSITION', width: CW * 0.2 },
            { label: `LOAD (${unit})`, width: CW * 0.14, align: 'right' },
            { label: 'INDICATION', width: CW * 0.15, align: 'right' },
            { label: 'ERROR', width: CW * 0.13, align: 'right' },
            { label: 'DIFF. FROM CENTRE', width: CW * 0.16, align: 'right' },
            { label: 'MPE', width: CW * 0.11, align: 'right' },
            { label: 'RESULT', width: CW * 0.11, align: 'center' },
          ], pos.map((p) => [
            { text: names[p.position] || p.position, bold: true },
            fmt(p.appliedLoad),
            fmt(p.indicatedValue),
            { text: fmt(p.error, true), color: p.passed ? C.TEXT : C.FAIL, bold: !p.passed },
            fmt(p.diffFromCenter),
            `± ${fmt(p.mpeMass)}`,
            verdictCell(p.passed),
          ]), { fontSize: 7 });
          y += 6;
        }
        summaryLine(r?.calculations?.summary || 'Not recorded', r?.result);
      }

      // 4. Temperature
      {
        const r = results.TEMPERATURE;
        moduleHeader(4, 'Temperature effect on zero and span', 'R 76-1 A.5.3 · zero drift ≤ 1e / 5 °C', 'तापमान प्रभाव', r?.result);
        const tp = r?.calculations?.temperaturePoints || [];
        if (!tp.length) notRecorded();
        else {
          y = T.table(doc, X, y, [
            { label: 'TEMPERATURE', width: CW * 0.14 },
            { label: 'ZERO IND.', width: CW * 0.14, align: 'right' },
            { label: `SPAN LOAD (${unit})`, width: CW * 0.16, align: 'right' },
            { label: 'SPAN IND.', width: CW * 0.15, align: 'right' },
            { label: 'CORRECTED ERROR', width: CW * 0.16, align: 'right' },
            { label: 'MPE', width: CW * 0.12, align: 'right' },
            { label: 'RESULT', width: CW * 0.13, align: 'center' },
          ], tp.map((p) => [
            { text: `${p.temperature} °C`, bold: true },
            fmt(p.zeroIndication),
            fmt(p.spanLoad),
            fmt(p.spanIndication),
            { text: fmt(p.correctedSpanError, true), color: p.spanPassed ? C.TEXT : C.FAIL, bold: !p.spanPassed },
            `± ${fmt(p.mpeMass)}`,
            verdictCell(p.spanPassed),
          ]), { fontSize: 7 });
          const drifts = r.calculations.zeroDriftEvaluations || [];
          if (drifts.length) {
            y += 4;
            y = T.table(doc, X, y, [
              { label: 'ZERO DRIFT BETWEEN', width: CW * 0.3 },
              { label: 'CHANGE IN E0', width: CW * 0.2, align: 'right' },
              { label: 'DRIFT PER 5 °C', width: CW * 0.2, align: 'right' },
              { label: 'LIMIT (1e)', width: CW * 0.17, align: 'right' },
              { label: 'RESULT', width: CW * 0.13, align: 'center' },
            ], drifts.map((dz) => [`${dz.fromTemp} °C → ${dz.toTemp} °C`.replace('→', 'to'), fmt(dz.deltaE0), fmt2(dz.driftPer5C), fmt(dz.allowedDrift), verdictCell(dz.driftPassed)]), { fontSize: 7 });
          }
          y += 6;
        }
        summaryLine(r?.calculations?.summary || 'Not recorded', r?.result);
      }

      // 5. Stability
      {
        const r = results.STABILITY;
        moduleHeader(5, 'Stability and warm-up', 'R 76-1 A.4.11', 'स्थिरता', r?.result);
        const tp = r?.calculations?.timePoints || [];
        if (!tp.length) notRecorded();
        else {
          y = T.table(doc, X, y, [
            { label: 'ELAPSED', width: CW * 0.16 },
            { label: 'ZERO READING', width: CW * 0.17, align: 'right' },
            { label: 'LOAD READING', width: CW * 0.18, align: 'right' },
            { label: 'ZERO DRIFT', width: CW * 0.15, align: 'right' },
            { label: 'SPAN DRIFT', width: CW * 0.16, align: 'right' },
            { label: 'RESULT', width: CW * 0.18, align: 'center' },
          ], tp.map((p) => [
            { text: p.timestampMinutes >= 60 ? `${p.timestampMinutes / 60} h` : `${p.timestampMinutes} min`, bold: true },
            fmt(p.zeroReading),
            fmt(p.loadReading),
            fmt(p.zeroDrift),
            { text: fmt(p.spanDrift), color: p.spanPassed ? C.TEXT : C.FAIL },
            verdictCell(p.zeroPassed && p.spanPassed),
          ]), { fontSize: 7 });
          y += 6;
        }
        summaryLine(r?.calculations?.summary || 'Not recorded', r?.result);
      }

      // 6. Time dependence
      {
        const r = results.TIME_DEPENDENCE;
        moduleHeader(6, 'Time dependence (creep & zero return)', 'R 76-1 A.4.8', 'समय निर्भरता', r?.result);
        const cr = r?.data?.creepReadings || [];
        const ca = r?.calculations?.creepAnalysis;
        const za = r?.calculations?.zeroReturnAnalysis;
        if (!cr.length || !ca) notRecorded();
        else {
          const w = (CW - 70) / cr.length;
          y = T.table(doc, X, y, [{ label: 'MINUTE', width: 70 }, ...cr.map((c) => ({ label: `${c.minute} MIN`, width: w, align: 'right' }))],
            [[{ text: `Indication (${unit})`, bold: true }, ...cr.map((c) => fmt(c.indication))]], { fontSize: 7 });
          y += 4;
          y = T.table(doc, X, y, [
            { label: 'CRITERION', width: CW * 0.45 },
            { label: 'OBSERVED', width: CW * 0.2, align: 'right' },
            { label: 'LIMIT', width: CW * 0.2, align: 'right' },
            { label: 'RESULT', width: CW * 0.15, align: 'center' },
          ], [
            ['Creep between 0 and 30 min', fmt(ca.delta30to0), `${fmt2(ca.allowedDelta30)} (0.5 MPE)`, verdictCell(ca.creep30Passed)],
            ['Creep between 15 and 30 min', fmt(ca.delta30to15), `${fmt2(ca.allowedDelta15to30)} (0.2 MPE)`, verdictCell(ca.creep15Passed)],
            ['Zero return after unloading', fmt(za?.zeroReturnError), `${fmt2(za?.allowedZeroReturn)} (0.5e)`, verdictCell(za?.zeroReturnPassed)],
          ], { fontSize: 7 });
          y += 6;
        }
        summaryLine(r?.calculations?.summary || 'Not recorded', r?.result);
      }

      // ================= Declaration =================
      ensure(150);
      y = T.sectionBar(doc, X, y, CW, 'E. Declaration and digital seal', null, 'घोषणा');
      y += 6;
      doc.fillColor(C.TEXT).font('Helvetica').fontSize(7.4).text(
        'I certify that the tests recorded above were carried out by me on the instrument described, using the standards stated, in accordance with OIML R 76-1:2006 and the Legal Metrology (General) Rules, 2011. The results were computed by the NAWI-ReportPro rules engine from the readings as entered and are sealed with the HMAC-SHA256 signature below; any alteration invalidates the seal.',
        X, y, { width: CW - 110 }
      );
      doc.image(qr, X + CW - 90, y - 2, { width: 88 });
      y = Math.max(doc.y + 16, y + 60);
      doc.fillColor(C.INDIA_BLUE).font('Helvetica-BoldOblique').fontSize(12).text(officer.name || '—', X, y);
      doc.moveTo(X, y + 17).lineTo(X + 200, y + 17).lineWidth(0.5).strokeColor(C.LINE).stroke();
      doc.fillColor(C.MUTED).font('Helvetica').fontSize(7)
        .text(`${officer.designation || 'Inspector of Legal Metrology'}${officer.district ? `, ${officer.district}` : ''}`, X, y + 21)
        .text(`Sealed ${T.formatDate(session.sealedAt || session.completedAt, true)}`, X, y + 31);
      y += 48;
      doc.rect(X, y, CW, 26).fill(C.BG);
      doc.fillColor(C.MUTED).font('Helvetica-Bold').fontSize(6).text('HMAC-SHA256 VERIFICATION SEAL', X + 6, y + 4);
      doc.fillColor(C.NAVY).font('Courier').fontSize(7.2).text(session.verificationSeal || 'UNSEALED', X + 6, y + 14, { lineBreak: false });

      // Page footers
      const range = doc.bufferedPageRange();
      for (let i = range.start; i < range.start + range.count; i += 1) {
        doc.switchToPage(i);
        doc.moveTo(X, H - 32).lineTo(X + CW, H - 32).lineWidth(0.4).strokeColor(C.LINE).stroke();
        doc.fillColor(C.FAINT).font('Helvetica').fontSize(6.2)
          .text(`${session.certificateNo}  •  Verify at ${verifyUrl.split('?')[0]}`, X, H - 26, { width: CW * 0.75, lineBreak: false })
          .text(`Page ${i + 1} of ${range.count}`, X, H - 26, { width: CW, align: 'right', lineBreak: false });
        T.tricolor(doc, 0, H - 6.6, W, 2.2);
      }

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

module.exports = {
  generateDataSheet,
  generateDataSheetPDF: generateDataSheet,
  generateDataSheetPdf: generateDataSheet,
  generateDatasheetPdf: generateDataSheet,
};
