/**
 * High-Throughput Batch CSV / Excel Import & Export Engine for NAWI Weighbridge Calibrations
 * Conforming to OIML R-76 (Edition 2006/E) and Legal Metrology Act, 2009.
 */

const prisma = require('../lib/prisma');
const { getMPE, calculateIndicationAndError, calculateWeighingPerformance } = require('./mpeCalculator');

/**
 * Standard 10-point weighbridge calibration load percentages
 */
const DEFAULT_WEIGHBRIDGE_POINTS = [0, 10, 20, 30, 40, 50, 60, 70, 80, 100];

/**
 * Sanitize cell values against CSV/Spreadsheet Formula Injection (CWE-1236)
 * Prefixes string values starting with '=', '+', '-', '@' with a single quote (')
 * and handles proper CSV escaping.
 *
 * @param {any} value - Cell value to sanitize
 * @returns {string} Sanitized string safe for spreadsheet opening
 */
function sanitizeFormulaInjection(value) {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.length === 0) return '';

  const formulaTriggers = ['=', '+', '-', '@'];
  let sanitized = str;
  if (formulaTriggers.includes(str.charAt(0))) {
    sanitized = `'${str}`;
  }

  if (sanitized.includes(',') || sanitized.includes('"') || sanitized.includes('\n') || sanitized.includes('\r')) {
    return `"${sanitized.replace(/"/g, '""')}"`;
  }
  return sanitized;
}

/**
 * Parse CSV raw text into structured array of rows
 * Handles comma, semicolon, tab delimiters, quoted strings, and carriage returns
 */
function parseCsvText(csvContent) {
  if (!csvContent || typeof csvContent !== 'string') {
    throw new Error('Invalid CSV content: expected non-empty string.');
  }

  const lines = csvContent
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line.length > 0 && !line.startsWith('#'));

  if (lines.length < 2) {
    throw new Error('CSV must contain at least a header row and one data row.');
  }

  // Detect delimiter (, or ; or \t)
  const firstLine = lines[0];
  let delimiter = ',';
  if (firstLine.includes('\t')) delimiter = '\t';
  else if (firstLine.includes(';') && !firstLine.includes(',')) delimiter = ';';

  const parseLine = (line) => {
    const result = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"' || char === "'") {
        inQuotes = !inQuotes;
      } else if (char === delimiter && !inQuotes) {
        result.push(current.trim().replace(/^["']|["']$/g, ''));
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current.trim().replace(/^["']|["']$/g, ''));
    return result;
  };

  const headers = parseLine(lines[0]).map(h => h.toLowerCase().replace(/[^a-z0-9_]/g, ''));
  const rows = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseLine(lines[i]);
    if (values.every(v => v === '')) continue; // skip empty line
    const rowObj = {};
    headers.forEach((header, index) => {
      rowObj[header] = values[index] !== undefined ? values[index] : '';
    });
    rows.push(rowObj);
  }

  return { headers, rows };
}

/**
 * Normalize and calculate 10-point weighbridge calibration series from parsed CSV rows
 * Supports:
 * - Wide format: Point, AppliedLoad, IndicatedInc, DeltaLInc, IndicatedDec, DeltaLDec
 * - Long format: Point, AppliedLoad, IndicatedValue, DeltaL, Direction (INC/DEC)
 * 
 * @param {Array} rows - Parsed CSV rows
 * @param {Object} instrument - Instrument metrological specs (maxCapacity, verificationInterval, accuracyClass)
 * @param {boolean} isInService - Whether in-service limits apply (2x MPE)
 */
function processWeighbridgeCalibrationCsv(rows, instrument, isInService = false) {
  const e = Number(instrument?.verificationInterval || instrument?.verificationScaleInterval_e) || 1;
  const max = Number(instrument?.maxCapacity) || 100000;
  const accuracyClass = instrument?.accuracyClass || 'CLASS_III';

  if (!rows || rows.length === 0) {
    throw new Error('No data rows found in CSV.');
  }

  const findCol = (row, candidates) => {
    for (const cand of candidates) {
      const key = Object.keys(row).find(k => k.includes(cand));
      if (key && row[key] !== '' && row[key] !== undefined) {
        return row[key];
      }
    }
    return undefined;
  };

  const processedPoints = [];

  // Check if format is Wide (Inc and Dec in same row) or Long (separate rows)
  const isWideFormat = rows.some(r => 
    findCol(r, ['inc', 'increasing']) !== undefined ||
    (findCol(r, ['dec', 'decreasing']) !== undefined)
  );

  if (isWideFormat) {
    // Process wide rows
    for (let idx = 0; idx < rows.length; idx++) {
      const r = rows[idx];
      const loadVal = findCol(r, ['load', 'applied', 'testload', 'nominal', 'target']);
      if (loadVal === undefined || isNaN(Number(loadVal))) continue;

      const appliedLoad = Number(loadVal);
      const incReadVal = findCol(r, ['indicatedinc', 'increading', 'incval', 'inc', 'increasingreading', 'readinc']);
      const decReadVal = findCol(r, ['indicateddec', 'decreading', 'decval', 'dec', 'decreasingreading', 'readdec']);
      
      const deltaLIncVal = findCol(r, ['deltalinc', 'deltainc', 'turningpointinc', 'dlinc', 'additionalweightsinc']);
      const deltaLDecVal = findCol(r, ['deltaldec', 'deltadec', 'turningpointdec', 'dldec', 'additionalweightsdec']);

      let incReading = appliedLoad;
      if (incReadVal !== undefined && incReadVal !== '') {
        incReading = isNaN(Number(incReadVal)) ? 0 : Number(incReadVal);
      }
      let decReading = appliedLoad;
      if (decReadVal !== undefined && decReadVal !== '') {
        decReading = isNaN(Number(decReadVal)) ? 0 : Number(decReadVal);
      }
      
      const deltaLInc = deltaLIncVal !== undefined && !isNaN(Number(deltaLIncVal)) ? Number(deltaLIncVal) : null;
      const deltaLDec = deltaLDecVal !== undefined && !isNaN(Number(deltaLDecVal)) ? Number(deltaLDecVal) : null;

      // Calculate continuous indication P and error E for increasing
      const incIndication = calculateIndicationAndError(appliedLoad, incReading, e, deltaLInc);
      // Calculate continuous indication P and error E for decreasing
      const decIndication = calculateIndicationAndError(appliedLoad, decReading, e, deltaLDec);

      // Load in units of e for MPE lookup
      const loadInE = appliedLoad / e;
      const mpeInE = getMPE(accuracyClass, loadInE, isInService);
      const mpeAbsolute = Number((mpeInE * e).toFixed(6));

      processedPoints.push({
        index: idx + 1,
        percentMax: Number(((appliedLoad / max) * 100).toFixed(1)),
        appliedLoad,
        incReading,
        deltaLInc: deltaLInc !== null ? deltaLInc : undefined,
        continuousIndicationInc: incIndication.continuousIndication,
        errorInc: incIndication.error,
        
        decReading,
        deltaLDec: deltaLDec !== null ? deltaLDec : undefined,
        continuousIndicationDec: decIndication.continuousIndication,
        errorDec: decIndication.error,
        
        mpeInE,
        mpeAbsolute,
      });
    }
  } else {
    // Group long format rows by applied load
    const loadMap = new Map();
    for (let idx = 0; idx < rows.length; idx++) {
      const r = rows[idx];
      const loadVal = findCol(r, ['load', 'applied', 'testload', 'nominal', 'target']);
      if (loadVal === undefined || isNaN(Number(loadVal))) continue;

      const appliedLoad = Number(loadVal);
      const readVal = findCol(r, ['indicated', 'reading', 'indication', 'value', 'weight']);
      const deltaLVal = findCol(r, ['deltal', 'delta', 'turningpoint', 'dl', 'additionalweight']);
      const dirVal = (findCol(r, ['direction', 'dir', 'mode', 'increasing', 'run']) || '').toLowerCase();
      
      const reading = readVal !== undefined && !isNaN(Number(readVal)) ? Number(readVal) : appliedLoad;
      const deltaL = deltaLVal !== undefined && !isNaN(Number(deltaLVal)) ? Number(deltaLVal) : null;
      const isInc = !dirVal.includes('dec') && !dirVal.includes('down') && !dirVal.includes('unload');

      if (!loadMap.has(appliedLoad)) {
        loadMap.set(appliedLoad, { appliedLoad, inc: null, dec: null });
      }
      const entry = loadMap.get(appliedLoad);
      if (isInc && !entry.inc) {
        entry.inc = { reading, deltaL };
      } else {
        entry.dec = { reading, deltaL };
      }
    }

    let idx = 1;
    for (const [appliedLoad, data] of loadMap.entries()) {
      const incReading = data.inc?.reading ?? appliedLoad;
      const decReading = data.dec?.reading ?? incReading;
      const deltaLInc = data.inc?.deltaL ?? null;
      const deltaLDec = data.dec?.deltaL ?? null;

      const incIndication = calculateIndicationAndError(appliedLoad, incReading, e, deltaLInc);
      const decIndication = calculateIndicationAndError(appliedLoad, decReading, e, deltaLDec);

      const loadInE = appliedLoad / e;
      const mpeInE = getMPE(accuracyClass, loadInE, isInService);
      const mpeAbsolute = Number((mpeInE * e).toFixed(6));

      processedPoints.push({
        index: idx++,
        percentMax: Number(((appliedLoad / max) * 100).toFixed(1)),
        appliedLoad,
        incReading,
        deltaLInc: deltaLInc !== null ? deltaLInc : undefined,
        continuousIndicationInc: incIndication.continuousIndication,
        errorInc: incIndication.error,
        decReading,
        deltaLDec: deltaLDec !== null ? deltaLDec : undefined,
        continuousIndicationDec: decIndication.continuousIndication,
        errorDec: decIndication.error,
        mpeInE,
        mpeAbsolute,
      });
    }
  }

  if (processedPoints.length === 0) {
    throw new Error('Could not parse any valid calibration measurement points from CSV. Ensure columns include AppliedLoad and IndicatedInc/IndicatedDec.');
  }

  // Sort points by applied load ascending
  processedPoints.sort((a, b) => a.appliedLoad - b.appliedLoad);

  // Determine Zero Error E0 from initial zero point
  const zeroPoint = processedPoints.find(p => p.appliedLoad === 0);
  const zeroErrorInc = zeroPoint ? zeroPoint.errorInc : 0;
  const zeroErrorDec = zeroPoint ? zeroPoint.errorDec : zeroErrorInc;

  let maxCorrectedError = 0;
  let maxHysteresis = 0;
  let allPointsPassed = true;

  const evaluatedPoints = processedPoints.map((pt) => {
    // Corrected error: Ec = E - E0 (OIML R-76 clause A.4.4.3)
    const correctedErrorInc = Number((pt.errorInc - zeroErrorInc).toFixed(6));
    const correctedErrorDec = Number((pt.errorDec - zeroErrorDec).toFixed(6));

    // Hysteresis error: |Ec_inc - Ec_dec|
    const hysteresis = Number(Math.abs(correctedErrorInc - correctedErrorDec).toFixed(6));
    
    // Pass/Fail check against MPE
    const incPass = Math.abs(correctedErrorInc) <= pt.mpeAbsolute + 1e-9;
    const decPass = Math.abs(correctedErrorDec) <= pt.mpeAbsolute + 1e-9;
    const hysPass = hysteresis <= pt.mpeAbsolute + 1e-9;
    const pointPass = incPass && decPass && hysPass;

    if (!pointPass) allPointsPassed = false;

    if (Math.abs(correctedErrorInc) > Math.abs(maxCorrectedError)) maxCorrectedError = correctedErrorInc;
    if (Math.abs(correctedErrorDec) > Math.abs(maxCorrectedError)) maxCorrectedError = correctedErrorDec;
    if (hysteresis > maxHysteresis) maxHysteresis = hysteresis;

    return {
      ...pt,
      zeroError: zeroErrorInc,
      correctedErrorInc,
      correctedErrorDec,
      hysteresis,
      incPass,
      decPass,
      hysPass,
      passed: pointPass,
    };
  });

  // Prepare standard payload compatible with Weighing Performance TestResult
  const testPointsPayload = evaluatedPoints.flatMap(pt => [
    {
      appliedLoad: pt.appliedLoad,
      indicatedValue: pt.incReading,
      deltaL: pt.deltaLInc,
      isIncreasing: true,
      continuousIndication: pt.continuousIndicationInc,
      error: pt.errorInc,
      correctedError: pt.correctedErrorInc,
      mpe: pt.mpeAbsolute,
      passed: pt.incPass,
    },
    {
      appliedLoad: pt.appliedLoad,
      indicatedValue: pt.decReading,
      deltaL: pt.deltaLDec,
      isIncreasing: false,
      continuousIndication: pt.continuousIndicationDec,
      error: pt.errorDec,
      correctedError: pt.correctedErrorDec,
      mpe: pt.mpeAbsolute,
      passed: pt.decPass,
    },
  ]);

  return {
    success: true,
    totalPoints: evaluatedPoints.length,
    passedPoints: evaluatedPoints.filter(p => p.passed).length,
    failedPoints: evaluatedPoints.filter(p => !p.passed).length,
    overallPass: allPointsPassed,
    zeroError: zeroErrorInc,
    maxCorrectedError,
    maxHysteresis,
    unit: instrument?.unit || 'kg',
    points: evaluatedPoints,
    weighingPerformance: {
      points: testPointsPayload,
      zeroError: zeroErrorInc,
      maxCorrectedError,
      maxMpeAllowed: evaluatedPoints.reduce((max, p) => Math.max(max, p.mpeAbsolute), 0),
      overallPass: allPointsPassed,
    },
    hysteresisValidation: {
      evaluations: evaluatedPoints.map(p => ({
        appliedLoad: p.appliedLoad,
        pInc: p.continuousIndicationInc,
        pDec: p.continuousIndicationDec,
        hysteresis: p.hysteresis,
        mpe: p.mpeAbsolute,
        passed: p.hysPass,
      })),
      maxHysteresis,
      overallPass: allPointsPassed,
    },
    testResultPayload: {
      points: testPointsPayload,
      zeroError: zeroErrorInc,
      maxCorrectedError,
      maxHysteresis,
      overallPass: allPointsPassed,
    },
  };
}

/**
 * Generate a downloadable 10-point CSV calibration template for a given instrument
 */
function generateSampleCsvTemplate(instrument) {
  const max = Number(instrument?.maxCapacity) || 100000;
  const e = Number(instrument?.verificationInterval || instrument?.verificationScaleInterval_e) || 20;
  const unit = instrument?.unit || 'kg';

  const rows = [
    `# NAWI-ReportPro Weighbridge 10-Point Calibration CSV Template`,
    `# Instrument: ${instrument?.model || 'Electronic Weighbridge'} (Max: ${max} ${unit}, e: ${e} ${unit})`,
    `# Instructions: Enter IndicatedInc, DeltaLInc (optional), IndicatedDec, DeltaLDec (optional)`,
    `Point,PercentMax,AppliedLoad_${unit},IndicatedInc_${unit},DeltaLInc_${unit},IndicatedDec_${unit},DeltaLDec_${unit}`,
  ];

  DEFAULT_WEIGHBRIDGE_POINTS.forEach((pct, idx) => {
    const load = Number(((pct / 100) * max).toFixed(2));
    const incReading = load;
    const deltaLInc = Number((0.5 * e).toFixed(2));
    const decReading = load;
    const deltaLDec = Number((0.5 * e).toFixed(2));
    rows.push(`${idx + 1},${pct}%,${load},${incReading},${deltaLInc},${decReading},${deltaLDec}`);
  });

  return rows.join('\r\n');
}

/**
 * Export complete test session data to CSV format
 * 
 * @param {string|Object} sessionIdOrSession - TestSession UUID or session object
 * @returns {Promise<{ filename: string, csvContent: string }>}
 */
async function exportSessionToCsv(sessionIdOrSession) {
  let session = null;

  if (typeof sessionIdOrSession === 'object' && sessionIdOrSession !== null) {
    session = sessionIdOrSession;
  } else if (typeof sessionIdOrSession === 'string') {
    if (prisma && prisma.testSession) {
      session = await prisma.testSession.findUnique({
        where: { id: sessionIdOrSession },
        include: {
          instrument: true,
          conductedBy: {
            select: { id: true, name: true, email: true, role: true },
          },
          testResults: {
            orderBy: { createdAt: 'asc' },
          },
        },
      });
    }
  }

  if (!session) {
    throw new Error(`Test session '${sessionIdOrSession}' not found.`);
  }

  const inst = session.instrument;
  const lines = [];

  // 1. Session Metadata Header
  lines.push('================================================================================');
  lines.push('NATIONAL LEGAL METROLOGY — NAWI-ReportPro OIML R-76 TEST REPORT (CSV EXPORT)');
  lines.push('================================================================================');
  lines.push(`Certificate Number,${sanitizeFormulaInjection(session.certificateNo)}`);
  lines.push(`Overall Status,${sanitizeFormulaInjection(session.status)}`);
  lines.push(`Overall Result,${sanitizeFormulaInjection(session.overallResult || 'PENDING')}`);
  lines.push(`Inspection Date,${session.startedAt ? new Date(session.startedAt).toISOString().split('T')[0] : 'N/A'}`);
  lines.push(`Verification Officer,${sanitizeFormulaInjection(session.conductedBy?.name || 'N/A')} (${sanitizeFormulaInjection(session.conductedBy?.email || '')})`);
  lines.push(`Ambient Temperature (°C),${session.temperature !== null ? session.temperature : 'N/A'}`);
  lines.push(`Ambient Humidity (%RH),${session.humidity !== null ? session.humidity : 'N/A'}`);
  lines.push(`Remarks,${sanitizeFormulaInjection(session.remarks || '')}`);
  lines.push('');

  // 2. Instrument Specifications
  lines.push('--------------------------------------------------------------------------------');
  lines.push('INSTRUMENT SPECIFICATIONS');
  lines.push('--------------------------------------------------------------------------------');
  lines.push(`Instrument Name,${sanitizeFormulaInjection(inst.name)}`);
  lines.push(`Manufacturer,${sanitizeFormulaInjection(inst.manufacturer)}`);
  lines.push(`Model,${sanitizeFormulaInjection(inst.model)}`);
  lines.push(`Serial Number,${sanitizeFormulaInjection(inst.serialNumber)}`);
  lines.push(`Accuracy Class,${sanitizeFormulaInjection(inst.accuracyClass)}`);
  lines.push(`Max Capacity,${inst.maxCapacity} ${sanitizeFormulaInjection(inst.unit)}`);
  lines.push(`Min Capacity,${inst.minCapacity} ${sanitizeFormulaInjection(inst.unit)}`);
  lines.push(`Verification Interval (e),${inst.verificationInterval} ${sanitizeFormulaInjection(inst.unit)}`);
  lines.push(`Actual Interval (d),${inst.actualInterval} ${sanitizeFormulaInjection(inst.unit)}`);
  lines.push(`Location,${sanitizeFormulaInjection(inst.location || '')}`);
  lines.push('');

  // 3. Test Results Modules
  for (const tr of session.testResults) {
    lines.push('--------------------------------------------------------------------------------');
    lines.push(`TEST MODULE: ${tr.testType} | STATUS: ${tr.status} | RESULT: ${tr.result || 'N/A'}`);
    lines.push('--------------------------------------------------------------------------------');

    if (tr.testType === 'WEIGHING_PERFORMANCE') {
      const points = Array.isArray(tr.data?.points) ? tr.data.points : [];
      lines.push('Direction,Applied Load (L),Indicated (I),Delta L,Continuous (P),Error (E),Corrected Error (Ec),MPE (±),Status');
      
      points.forEach(pt => {
        const dir = pt.isIncreasing ? 'Increasing (Loading)' : 'Decreasing (Unloading)';
        const l = pt.appliedLoad ?? '';
        const i = pt.indicatedValue ?? '';
        const dl = pt.deltaL ?? '';
        const p = pt.continuousIndication ?? i;
        const e = pt.error ?? '';
        const ec = pt.correctedError ?? e;
        const mpe = pt.mpe ?? '';
        const st = pt.passed === true ? 'PASS' : pt.passed === false ? 'FAIL' : 'N/A';
        lines.push(`${dir},${l},${i},${dl},${p},${ec},${ec},${mpe},${st}`);
      });
      lines.push('');
    } else if (tr.testType === 'REPEATABILITY') {
      const series = Array.isArray(tr.data?.series) ? tr.data.series : [];
      lines.push('Series Load,Run #,Reading (kg),Deviation from Mean (kg),MPE Limit,Result');
      series.forEach((s, sIdx) => {
        const readings = Array.isArray(s.readings) ? s.readings : [];
        const mean = readings.length > 0 ? readings.reduce((a, b) => a + Number(b), 0) / readings.length : 0;
        readings.forEach((r, rIdx) => {
          const dev = (Number(r) - mean).toFixed(5);
          lines.push(`${s.load || 'N/A'},Run ${rIdx + 1},${r},${dev},${tr.calculations?.mpeAllowed || 'N/A'},${tr.result || 'PASS'}`);
        });
      });
      lines.push('');
    } else if (tr.testType === 'ECCENTRICITY') {
      const positions = Array.isArray(tr.data?.positions) ? tr.data.positions : [];
      lines.push('Position,Applied Load,Indication,Error vs Center,MPE Limit,Result');
      const centerRead = positions.find(p => p.position === 'CENTER')?.indicatedValue || positions[0]?.indicatedValue || 0;
      positions.forEach(pos => {
        const diff = (Number(pos.indicatedValue) - Number(centerRead)).toFixed(5);
        lines.push(`${pos.position},${pos.appliedLoad},${pos.indicatedValue},${diff},${tr.calculations?.mpeAllowed || 'N/A'},${tr.result || 'PASS'}`);
      });
      lines.push('');
    } else {
      // General raw data dump for other test types
      lines.push('Raw Data Payload:');
      lines.push(`"${JSON.stringify(tr.data).replace(/"/g, '""')}"`);
      if (tr.calculations) {
        lines.push('Calculations Output:');
        lines.push(`"${JSON.stringify(tr.calculations).replace(/"/g, '""')}"`);
      }
      lines.push('');
    }
  }

  const safeCert = (session.certificateNo || 'session').replace(/[^a-zA-Z0-9-_]/g, '_');
  const filename = `NAWI_${safeCert}_Calibration_Export.csv`;
  const csvContent = lines.join('\r\n');

  return { filename, csvContent };
}

module.exports = {
  parseCsvText,
  processWeighbridgeCalibrationCsv,
  generateSampleCsvTemplate,
  exportSessionToCsv,
  sanitizeFormulaInjection,
};
