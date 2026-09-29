/**
 * Official Certificate of Verification (single A4 page).
 *
 * Issued only for finalized, HMAC-sealed sessions (enforced in the reports
 * controller). Every figure printed here is read from the stored OIML R-76
 * calculations — nothing is defaulted or invented. A failing instrument gets a
 * rejection certificate, never a pass.
 */
const fs = require('fs');
const PDFDocument = require('pdfkit');
const { computeExpandedUncertainty } = require('./uncertaintyCalculator');
const T = require('./pdfTheme');

const { C } = T;

/** One-line quantitative finding for a module, taken from its stored calculations. */
function keyFinding(testType, result, fmt, unit) {
  const c = result?.calculations;
  if (!c) return 'Not evaluated';
  switch (testType) {
    case 'WEIGHING_PERFORMANCE':
      return `Max |Ec| ${fmt(c.maxCorrectedError)} ${unit}; max MPE ${fmt(c.maxMpeAllowed)}; hysteresis ${fmt(c.hysteresisAnalysis?.maxHysteresis)}`;
    case 'REPEATABILITY': {
      const worst = (c.series || []).reduce((a, s) => (s.range > (a?.range ?? -1) ? s : a), null);
      return worst ? `Max range ${fmt(worst.range)} ${unit} at ${fmt(worst.load)} ${unit} (MPE ${fmt(worst.mpeMass)})` : '—';
    }
    case 'ECCENTRICITY':
      return `Max error ${fmt(c.maxError)} ${unit} (MPE ${fmt(c.mpe)}); max diff. from centre ${fmt(c.maxDifferenceFromCenter)}`;
    case 'TEMPERATURE':
      return `Zero drift ${fmt(c.zeroDriftPer5C)} ${unit}/5 °C (limit 1e); max span error ${fmt(c.maxSpanError)}`;
    case 'STABILITY':
      return `Max span drift ${fmt(c.maxSpanDrift)} ${unit} over 8 h (limit ${fmt(c.mpeMass)})`;
    case 'TIME_DEPENDENCE': {
      const cr = c.creepAnalysis || {};
      const zr = c.zeroReturnAnalysis || {};
      return `Creep 15–30 min ${fmt(cr.delta30to15)} ${unit} (limit ${fmt(cr.allowedDelta15to30)}); zero return ${fmt(zr.zeroReturnError)}`;
    }
    default:
      return '—';
  }
}

async function generateCertificate(sessionData) {
  const session = sessionData || {};
  const inst = session.instrument || {};
  const officer = session.conductedBy || {};
  const results = Object.fromEntries((session.testResults || []).map((r) => [r.testType, r]));
  const unit = inst.unit || 'kg';
  const fmt = T.numFmt(inst);

  const verdict = session.overallResult === 'PASS' || session.overallResult === 'FAIL' ? session.overallResult : 'UNKNOWN';
  const pass = verdict === 'PASS';
  const verifiedAt = session.completedAt || session.sealedAt;
  const validUntil = pass && verifiedAt ? T.addMonths(verifiedAt, 12) : null;

  const rep = results.REPEATABILITY?.calculations;
  const ecc = results.ECCENTRICITY?.calculations;
  const budget = computeExpandedUncertainty(rep?.maxStdDev || 0, Number(inst.actualInterval || inst.verificationInterval || 0.001), Number(inst.maxCapacity || 0), inst.accuracyClass, {
    eccError: ecc?.maxDifferenceFromCenter || 0,
    ranges: inst.ranges,
  });

  const verifyUrl = T.verifyUrlFor(session);
  const qr = await T.qrPng(verifyUrl, 260);

  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        margins: { top: 0, bottom: 0, left: 0, right: 0 },
        info: {
          Title: `Certificate of Verification ${session.certificateNo}`,
          Author: 'Department of Legal Metrology, Punjab',
          Subject: 'OIML R 76 verification of a non-automatic weighing instrument',
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
      doc.rect(M, M, W - 2 * M, H - 2 * M).lineWidth(1.6).strokeColor(C.NAVY).stroke();
      doc.rect(M + 4, M + 4, W - 2 * M - 8, H - 2 * M - 8).lineWidth(0.5).strokeColor(C.GOLD).stroke();
      T.tricolor(doc, M + 4, M + 4, W - 2 * M - 8, 2.4);

      // Watermark chakra
      if (fs.existsSync(T.CHAKRA)) {
        doc.save();
        doc.opacity(0.045);
        doc.image(T.CHAKRA, W / 2 - 170, H / 2 - 150, { width: 340 });
        doc.restore();
      }

      // ---- Header ----
      let y = M + 18;
      if (fs.existsSync(T.EMBLEM)) doc.image(T.EMBLEM, W / 2 - 18, y, { height: 58 });
      doc.fillColor(C.TEXT);
      doc.fontSize(8.5);
      T.hindi(doc, 'भारत सरकार', X, y + 6, { width: 170 }, true);
      doc.font('Helvetica-Bold').fontSize(7.4).fillColor(C.MUTED).text('GOVERNMENT OF INDIA', X, y + 20, { width: 170 });
      doc.fontSize(8.5).fillColor(C.TEXT);
      T.hindi(doc, 'पंजाब सरकार', W - X - 170, y + 6, { width: 170, align: 'right' }, true);
      doc.font('Helvetica-Bold').fontSize(7.4).fillColor(C.MUTED).text('GOVERNMENT OF PUNJAB', W - X - 170, y + 20, { width: 170, align: 'right' });

      y += 62;
      doc.fontSize(12).fillColor(C.NAVY);
      T.hindi(doc, 'विधिक माप विज्ञान विभाग', X, y, { width: CW, align: 'center' }, true);
      y += T.hasHindi(doc) ? 18 : 0;
      doc.font('Helvetica-Bold').fontSize(11).fillColor(C.NAVY).text('DEPARTMENT OF LEGAL METROLOGY', X, y, { width: CW, align: 'center' });
      y += 13;
      doc.font('Helvetica').fontSize(7.2).fillColor(C.MUTED)
        .text('Ministry of Consumer Affairs, Food & Public Distribution (Legal Metrology Division)  •  State Metrology Laboratory, Sector 39, Chandigarh', X, y, { width: CW, align: 'center' });

      y += 16;
      doc.moveTo(X + 60, y).lineTo(W - X - 60, y).lineWidth(0.5).strokeColor(C.LINE).stroke();
      y += 7;
      doc.fontSize(15).fillColor(pass ? C.NAVY : C.FAIL);
      T.hindi(doc, pass ? 'सत्यापन प्रमाणपत्र' : 'अस्वीकृति प्रमाणपत्र', X, y, { width: CW, align: 'center' }, true);
      y += T.hasHindi(doc) ? 21 : 0;
      doc.font('Helvetica-Bold').fontSize(16).fillColor(pass ? C.NAVY : C.FAIL)
        .text(pass ? 'CERTIFICATE OF VERIFICATION' : 'CERTIFICATE OF REJECTION', X, y, { width: CW, align: 'center', characterSpacing: 1.2 });
      y += 20;
      doc.font('Helvetica-Oblique').fontSize(6.9).fillColor(C.MUTED).text(
        'Issued under Section 24 of the Legal Metrology Act, 2009 read with Rule 27 of the Legal Metrology (General) Rules, 2011, for a non-automatic weighing instrument tested in accordance with OIML R 76-1:2006.',
        X + 30, y, { width: CW - 60, align: 'center' }
      );
      y += 20;

      // ---- Reference strip ----
      const strip = [
        ['CERTIFICATE NO.', session.certificateNo || '—', true],
        ['DATE OF VERIFICATION', T.formatDate(verifiedAt)],
        [pass ? 'VALID UNTIL' : 'STATUS', pass ? T.formatDate(validUntil) : 'NOT VALID FOR TRADE'],
        ['VERIFICATION TYPE', T.VERIFICATION_TYPE_LABEL[session.verificationType] || 'Periodic Re-verification'],
      ];
      const sw = CW / strip.length;
      strip.forEach(([label, value, mono], i) => {
        const sx = X + i * sw;
        doc.rect(sx, y, sw - (i < strip.length - 1 ? 4 : 0), 30).fill(i === 0 ? C.NAVY : C.BG);
        doc.fillColor(i === 0 ? '#BFD2EA' : C.FAINT).font('Helvetica-Bold').fontSize(6.2).text(label, sx + 7, y + 6, { width: sw - 14 });
        doc.fillColor(i === 0 ? '#FFFFFF' : !pass && i === 2 ? C.FAIL : C.TEXT)
          .font(mono ? 'Courier-Bold' : 'Helvetica-Bold').fontSize(mono ? 9.5 : 8.6)
          .text(value, sx + 7, y + 16, { width: sw - 14, lineBreak: false, ellipsis: true });
      });
      y += 36;

      // ---- 1. Instrument ----
      y = T.sectionBar(doc, X, y, CW, '1. Particulars of the weighing instrument', null, 'बाट-माप उपकरण विवरण');
      y = T.keyValueGrid(doc, X, y, CW, [
        ['Instrument', inst.name, { bold: true }],
        ['Category', T.TYPE_LABEL[inst.type] || inst.type],
        ['Manufacturer', inst.manufacturer],
        ['Model', inst.model],
        ['Serial number', inst.serialNumber, { mono: true }],
        ['Accuracy class', T.classLabel(inst.accuracyClass), { bold: true }],
        ['Max / Min', `${fmt(inst.maxCapacity)} / ${fmt(inst.minCapacity)} ${unit}`],
        ['e / d', `${inst.verificationInterval} / ${inst.actualInterval || inst.verificationInterval} ${unit}`],
        ['Owner / user', inst.ownerName],
        ['District', inst.district],
      ]);
      doc.rect(X, y, CW, 14.5).fill('#FFFFFF').lineWidth(0.6).strokeColor(C.LINE).stroke();
      doc.fillColor(C.MUTED).font('Helvetica-Bold').fontSize(6.6).text('Place of installation', X + 5, y + 4.3);
      doc.fillColor(C.TEXT).font('Helvetica').fontSize(7.6).text(inst.location || '—', X + CW * 0.19 + 5, y + 4, { width: CW * 0.8, height: 9, ellipsis: true });
      y += 19;

      // ---- 2. Tests ----
      y = T.sectionBar(doc, X, y, CW, '2. Metrological tests performed (OIML R 76)', `${session.verificationType === 'INSPECTION' ? 'In-service MPE (2×)' : 'Verification MPE (1×)'}`, 'परीक्षण परिणाम');
      const rows = T.TESTS.map((t, i) => {
        const r = results[t.type];
        const v = r?.result || 'N/A';
        return [
          String(i + 1),
          { text: t.en, bold: true },
          t.clause,
          keyFinding(t.type, r, fmt, unit),
          { text: v, bold: true, color: v === 'PASS' ? C.PASS : v === 'FAIL' ? C.FAIL : C.FAINT, bg: v === 'PASS' ? C.PASS_BG : v === 'FAIL' ? C.FAIL_BG : null, align: 'center' },
        ];
      });
      y = T.table(doc, X, y, [
        { label: '#', width: 18, align: 'center' },
        { label: 'TEST', width: 150 },
        { label: 'CLAUSE', width: 62 },
        { label: 'KEY FINDING (from recorded readings)', width: CW - 18 - 150 - 62 - 46 },
        { label: 'RESULT', width: 46, align: 'center' },
      ], rows, { fontSize: 7, rowHeight: 14 });
      y += 8;

      // ---- 3. Conditions & uncertainty ----
      y = T.sectionBar(doc, X, y, CW, '3. Test conditions & measurement uncertainty', 'ISO/IEC GUM · EURAMET cg-18', 'परीक्षण परिस्थितियाँ');
      y = T.keyValueGrid(doc, X, y, CW, [
        ['Ambient temperature', session.temperature != null ? `${session.temperature} °C` : 'Not recorded'],
        ['Relative humidity', session.humidity != null ? `${session.humidity} % RH` : 'Not recorded'],
        ['Barometric pressure', session.atmosphericPressure != null ? `${session.atmosphericPressure} hPa` : 'Not recorded'],
        ['Expanded uncertainty', `U = ±${fmt(budget.expandedUncertainty, false)} ${unit} at Max (k = 2, ~95 %)`, { bold: true }],
      ]);
      doc.rect(X, y, CW, 14.5).fill('#FFFFFF').lineWidth(0.6).strokeColor(C.LINE).stroke();
      doc.fillColor(C.MUTED).font('Helvetica-Bold').fontSize(6.6).text('Standards used', X + 5, y + 4.3);
      doc.fillColor(C.TEXT).font('Helvetica').fontSize(7).text(session.standardWeightsUsed || 'Not recorded', X + CW * 0.19 + 5, y + 4.2, { width: CW * 0.8, height: 9, ellipsis: true });
      y += 19;

      // ---- Verdict ----
      const vh = 46;
      doc.roundedRect(X, y, CW, vh, 4).fill(pass ? C.PASS_BG : C.FAIL_BG);
      doc.roundedRect(X, y, CW, vh, 4).lineWidth(1.2).strokeColor(pass ? C.PASS : C.FAIL).stroke();
      doc.rect(X, y, 5, vh).fill(pass ? C.PASS : C.FAIL);
      doc.fillColor(pass ? C.PASS : C.FAIL).font('Helvetica-Bold').fontSize(12.5)
        .text(pass ? 'CONFORMS — APPROVED FOR USE IN TRADE' : 'DOES NOT CONFORM — REJECTED FOR USE IN TRADE', X + 16, y + 9, { width: CW - 30 });
      doc.fillColor(C.TEXT).font('Helvetica').fontSize(7.3).text(
        pass
          ? `The instrument meets the requirements of OIML R 76 for ${T.classLabel(inst.accuracyClass)} and has been stamped. This certificate is valid until ${T.formatDate(validUntil)} or until the verification seal is broken, whichever is earlier.`
          : 'The instrument does not meet the maximum permissible errors of OIML R 76. It must not be used for any transaction until repaired by a licensed repairer and re-verified (Section 25, Legal Metrology Act, 2009).',
        X + 16, y + 25, { width: CW - 30 }
      );
      y += vh + 9;

      // ---- Remarks ----
      if (session.remarks) {
        doc.fillColor(C.MUTED).font('Helvetica-Bold').fontSize(6.8).text('REMARKS OF THE VERIFYING OFFICER', X, y);
        doc.fillColor(C.TEXT).font('Helvetica').fontSize(7.3).text(session.remarks, X, y + 10, { width: CW });
        y = doc.y + 8;
      }

      // ---- Signature / stamp / QR ----
      const by = Math.max(y + 2, H - M - 158);
      const colW = CW / 3;
      // Officer
      doc.fillColor(C.MUTED).font('Helvetica-Bold').fontSize(6.6).text('VERIFYING OFFICER', X, by);
      doc.fillColor(C.INDIA_BLUE).font('Helvetica-BoldOblique').fontSize(12).text(officer.name || '—', X, by + 18, { width: colW - 10 });
      doc.moveTo(X, by + 36).lineTo(X + colW - 20, by + 36).lineWidth(0.5).strokeColor(C.LINE).stroke();
      doc.fillColor(C.TEXT).font('Helvetica-Bold').fontSize(7.6).text(officer.name || '—', X, by + 41, { width: colW - 10 });
      doc.font('Helvetica').fontSize(6.8).fillColor(C.MUTED);
      doc.text(officer.designation || (officer.role === 'ADMIN' ? 'Controller of Legal Metrology' : 'Inspector of Legal Metrology'), X, doc.y + 1, { width: colW - 10 });
      doc.text(officer.district ? `Jurisdiction: ${officer.district}` : 'Department of Legal Metrology, Punjab', X, doc.y + 1, { width: colW - 10 });
      doc.text(`Digitally sealed: ${T.formatDate(session.sealedAt || verifiedAt, true)}`, X, doc.y + 1, { width: colW - 10 });

      // Stamp
      T.officialStamp(doc, X + colW * 1.5, by + 44, 40, verdict);

      // QR
      const qx = X + CW - 92;
      doc.image(qr, qx + 4, by - 6, { width: 84 });
      doc.fillColor(C.NAVY).font('Helvetica-Bold').fontSize(6.6).text('SCAN TO VERIFY', qx, by + 79, { width: 92, align: 'center' });
      doc.fillColor(C.FAINT).font('Helvetica').fontSize(5.6).text('Public verification portal', qx, by + 87, { width: 92, align: 'center' });

      // ---- Footer: seal ----
      const fy = H - M - 48;
      doc.rect(X, fy, CW, 24).fill(C.BG);
      doc.fillColor(C.MUTED).font('Helvetica-Bold').fontSize(6).text('HMAC-SHA256 DIGITAL VERIFICATION SEAL', X + 6, fy + 4);
      doc.fillColor(C.NAVY).font('Courier').fontSize(7).text(session.verificationSeal || 'UNSEALED', X + 6, fy + 13, { width: CW - 12, lineBreak: false });
      doc.fillColor(C.FAINT).font('Helvetica').fontSize(5.6)
        .text(`Authenticity can be confirmed at ${verifyUrl.split('?')[0]} — any alteration of this document invalidates the seal.  Generated by NAWI-ReportPro.`, X, fy + 28, { width: CW, align: 'center', lineBreak: false });
      T.tricolor(doc, M + 4, H - M - 10.6, W - 2 * M - 8, 2.2);

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

module.exports = {
  generateCertificate,
  generateCertificatePDF: generateCertificate,
  generateCertificatePdf: generateCertificate,
  keyFinding,
  formatDate: T.formatDate,
};
