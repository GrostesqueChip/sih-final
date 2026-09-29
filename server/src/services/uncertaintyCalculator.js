/**
 * ISO GUM / EURAMET cg-18 Compliant Measurement Uncertainty Engine
 * Reference:
 * - JCGM 100:2008 / ISO/IEC Guide 98-3:2008 (Guide to the expression of uncertainty in measurement - GUM)
 * - EURAMET cg-18 (Version 4.0, 11/2015): Guidelines on the Calibration of Non-Automatic Weighing Instruments
 * - OIML R 111-1:2004 (Weights of classes E1, E2, F1, F2, M1, M1-2, M2, M2-3, M3)
 */

const { getMPE, calculateMultiIntervalMPE } = require('./mpeCalculator');

// Typical sensitivity temperature coefficient TK_c (in 1/°C) by accuracy class per OIML R-76 clause 3.9.2
const TEMPERATURE_COEFFICIENT_TK = {
  CLASS_I: 1.0e-6,   // 1 ppm / °C
  CLASS_II: 2.0e-6,  // 2 ppm / °C
  CLASS_III: 1.0e-5, // 10 ppm / °C
  CLASS_IIII: 2.0e-5,// 20 ppm / °C
};

// Typical standard weights class MPE factor relative to NAWI MPE
// Per EURAMET cg-18 Section 7.1.2: Standard weights used for calibration shall satisfy MPE_std <= 1/3 MPE(L)
const DEFAULT_WEIGHT_CLASS_BY_ACCURACY = {
  CLASS_I: 'E2',
  CLASS_II: 'F1',
  CLASS_III: 'M1',
  CLASS_IIII: 'M2',
};

/**
 * Helper to round to specified decimal places
 */
function roundTo(val, decimals = 6) {
  if (val === undefined || val === null || isNaN(val)) return 0;
  const factor = Math.pow(10, decimals);
  return Math.round((Number(val) + Number.EPSILON) * factor) / factor;
}

/**
 * 1. Compute Type A Standard Uncertainty from Repeatability Measurements
 * Per EURAMET cg-18 Section 7.1.1:
 * u_rep(W) = s (sample standard deviation of n repeated weighings at load L)
 * If s = 0 or n < 2, u_rep = d / (2 * sqrt(3))
 * 
 * @param {number|Array<number>} repeatabilityInput - Standard deviation s or array of repeated readings
 * @param {number} [d=0.001] - Scale interval d
 * @param {number} [nReadings=6] - Number of readings
 * @returns {Object} { u_rep, stdDev, nReadings, degreesOfFreedom }
 */
function computeRepeatabilityUncertainty(repeatabilityInput, d = 0.001, nReadings = 6) {
  const scaleD = Number(d) || 0.001;
  let s = 0;
  let n = Number(nReadings) || 6;

  if (Array.isArray(repeatabilityInput)) {
    const raw = repeatabilityInput.map(r => (typeof r === 'object' ? Number(r.indicatedValue ?? r.reading ?? 0) : Number(r))).filter(v => !isNaN(v));
    n = raw.length;
    if (n >= 2) {
      const mean = raw.reduce((sum, val) => sum + val, 0) / n;
      const variance = raw.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / (n - 1);
      s = Math.sqrt(variance);
    }
  } else {
    s = Math.abs(Number(repeatabilityInput) || 0);
  }

  // If standard deviation is 0 or less than half resolution, use resolution lower bound
  const minBound = scaleD / (2 * Math.sqrt(3));
  const u_rep = s > 0 ? s : minBound;
  const degreesOfFreedom = n >= 2 ? n - 1 : 50;

  return {
    u_rep: roundTo(u_rep, 8),
    stdDev: roundTo(s, 8),
    nReadings: n,
    degreesOfFreedom,
  };
}

/**
 * 2. Compute Digital Resolution Standard Uncertainty
 * Per EURAMET cg-18 Section 7.1.1 (Formula 7.1-2):
 * For digital indicator with interval d:
 * u_res = d / (2 * sqrt(3))
 * Combined for zero + load: u_res_combined = d / sqrt(6)
 * 
 * @param {number} d - Scale interval d
 * @returns {Object} { u_res, u_res_combined, d }
 */
function computeResolutionUncertainty(d) {
  const scaleD = Number(d) || 0.001;
  const u_res = scaleD / (2 * Math.sqrt(3));
  const u_res_combined = scaleD / Math.sqrt(6);

  return {
    u_res: roundTo(u_res, 8),
    u_res_combined: roundTo(u_res_combined, 8),
    d: scaleD,
    degreesOfFreedom: Infinity,
  };
}

/**
 * 3. Compute Reference Standard Weights Standard Uncertainty
 * Per EURAMET cg-18 Section 7.1.2:
 * If expanded uncertainty U_std (k=2) is known from calibration certificate:
 *   u_std = U_std / 2
 * If only MPE of standard weight is known (OIML R-111, rectangular distribution):
 *   u_std = MPE_std / sqrt(3)
 * If not provided, estimated as (1/3) * MPE_NAWI(L) / sqrt(3)
 * 
 * @param {number} appliedLoad - Applied test load L
 * @param {string} accuracyClass - 'CLASS_I' | 'CLASS_II' | 'CLASS_III' | 'CLASS_IIII'
 * @param {Object} [options] - { standardWeightMpe, standardWeightU, standardWeightClass, e, ranges }
 * @returns {Object} { u_std, standardWeightMpe, degreesOfFreedom }
 */
function computeStandardWeightsUncertainty(appliedLoad, accuracyClass, options = {}) {
  const L = Math.abs(Number(appliedLoad) || 0);
  const normClass = String(accuracyClass || 'CLASS_III').toUpperCase();
  const e = Number(options.e) || 0.001;

  let u_std = 0;
  let standardWeightMpe = 0;

  if (options.standardWeightU !== undefined && options.standardWeightU !== null && Number(options.standardWeightU) > 0) {
    const k_std = Number(options.k_std || 2);
    u_std = Number(options.standardWeightU) / k_std;
    standardWeightMpe = Number(options.standardWeightU);
  } else if (options.standardWeightMpe !== undefined && options.standardWeightMpe !== null && Number(options.standardWeightMpe) > 0) {
    standardWeightMpe = Number(options.standardWeightMpe);
    u_std = standardWeightMpe / Math.sqrt(3);
  } else {
    // Estimate from OIML R-76 MPE for instrument: MPE_std = (1/3) * MPE_NAWI
    const mpeInfo = calculateMultiIntervalMPE(L, normClass, options.ranges || [{ max: Infinity, e }]);
    const mpeNAWI = mpeInfo.mpe;
    standardWeightMpe = mpeNAWI / 3.0;
    u_std = standardWeightMpe / Math.sqrt(3);
  }

  return {
    u_std: roundTo(u_std, 8),
    standardWeightMpe: roundTo(standardWeightMpe, 8),
    degreesOfFreedom: 100,
  };
}

/**
 * 4. Compute Eccentricity Loading Standard Uncertainty
 * Per EURAMET cg-18 Section 7.1.3:
 * u_ecc = |Delta I_ecc| / (2 * L_ecc * sqrt(3)) * L
 * where Delta I_ecc is the maximum difference observed in eccentricity test at load L_ecc.
 * 
 * @param {number} appliedLoad - Applied load L
 * @param {number} [eccError=0] - Max error or difference from eccentricity test Delta I_ecc
 * @param {number} [eccLoad=null] - Eccentricity test load L_ecc (defaults to appliedLoad or 1/3 Max)
 * @returns {Object} { u_ecc, eccError, degreesOfFreedom }
 */
function computeEccentricityUncertainty(appliedLoad, eccError = 0, eccLoad = null) {
  const L = Math.abs(Number(appliedLoad) || 0);
  const deltaEcc = Math.abs(Number(eccError) || 0);
  const L_ecc = Math.abs(Number(eccLoad) || L || 1);

  let u_ecc = 0;
  if (deltaEcc > 0 && L > 0 && L_ecc > 0) {
    u_ecc = (deltaEcc / (2 * L_ecc * Math.sqrt(3))) * L;
  } else if (deltaEcc > 0 && L === 0) {
    u_ecc = 0;
  } else if (deltaEcc > 0) {
    u_ecc = deltaEcc / (2 * Math.sqrt(3));
  }

  return {
    u_ecc: roundTo(u_ecc, 8),
    eccError: deltaEcc,
    degreesOfFreedom: Infinity,
  };
}

/**
 * 5. Compute Temperature Drift Standard Uncertainty
 * Per EURAMET cg-18 Section 7.1.4:
 * u_temp = (TK_c * L * Delta_T) / sqrt(3)
 * where TK_c is temperature coefficient of sensitivity, Delta_T is ambient variation.
 * 
 * @param {number} appliedLoad - Applied load L
 * @param {string} accuracyClass - Instrument class
 * @param {number} [tempVariation=2.0] - Temperature variation during test Delta T (°C)
 * @param {number} [customTK=null] - Custom TK_c value
 * @returns {Object} { u_temp, tempVariation, tk_c, degreesOfFreedom }
 */
function computeTemperatureUncertainty(appliedLoad, accuracyClass, tempVariation = 2.0, customTK = null) {
  const L = Math.abs(Number(appliedLoad) || 0);
  const normClass = String(accuracyClass || 'CLASS_III').toUpperCase();
  const tk_c = Number(customTK) || TEMPERATURE_COEFFICIENT_TK[normClass] || 1.0e-5;
  const deltaT = Math.abs(Number(tempVariation) || 2.0); // Default 2°C variation during test

  const deltaTemp = tk_c * L * deltaT;
  const u_temp = deltaTemp / Math.sqrt(3);

  return {
    u_temp: roundTo(u_temp, 8),
    tempVariation: deltaT,
    tk_c,
    degreesOfFreedom: Infinity,
  };
}

/**
 * Main Uncertainty Calculator Function: Compute ISO GUM / EURAMET cg-18 Expanded Uncertainty Budget
 * 
 * @param {number|Array<number>} repeatabilityStdDev - Standard deviation s or array of repeated readings
 * @param {number} scaleInterval_d - Actual scale interval d
 * @param {number} appliedLoad - Applied test load L
 * @param {string} accuracyClass - 'CLASS_I' | 'CLASS_II' | 'CLASS_III' | 'CLASS_IIII'
 * @param {Object} [options] - Optional parameter overrides:
 *   - eccError: Max eccentricity deviation (Delta I_ecc)
 *   - eccLoad: Eccentricity test load L_ecc
 *   - tempVariation: Temperature drift Delta T in °C
 *   - standardWeightMpe: Standard weight MPE
 *   - standardWeightU: Standard weight expanded uncertainty U
 *   - coverageFactor: k (defaults to 2 for 95.45% confidence)
 *   - nReadings: number of repeated measurements (default 6)
 *   - ranges: multi-interval scale ranges
 * @returns {Object} UncertaintyBudget matching PROJECT.md interface contract
 */
function computeExpandedUncertainty(
  repeatabilityStdDev,
  scaleInterval_d,
  appliedLoad,
  accuracyClass = 'CLASS_III',
  options = {}
) {
  const L = Math.abs(Number(appliedLoad) || 0);
  const d = Number(scaleInterval_d) || 0.001;
  const normClass = String(accuracyClass || 'CLASS_III').toUpperCase();
  const k = Number(options?.coverageFactor || 2);
  const nReadings = Number(options?.nReadings || 6);

  // 1. Repeatability component u_rep
  const repRes = computeRepeatabilityUncertainty(repeatabilityStdDev, d, nReadings);
  const u_rep = repRes.u_rep;

  // 2. Digital resolution component u_res = d / (2 * sqrt(3))
  const resRes = computeResolutionUncertainty(d);
  const u_res = resRes.u_res;

  // 3. Reference standard weights component u_std = MPE_std / sqrt(3)
  const stdRes = computeStandardWeightsUncertainty(L, normClass, {
    standardWeightMpe: options?.standardWeightMpe,
    standardWeightU: options?.standardWeightU,
    e: d,
    ranges: options?.ranges,
  });
  const u_std = stdRes.u_std;

  // 4. Eccentricity component u_ecc
  const eccRes = computeEccentricityUncertainty(L, options?.eccError || options?.eccentricityError || 0, options?.eccLoad);
  const u_ecc = eccRes.u_ecc;

  // 5. Temperature component u_temp
  const tempRes = computeTemperatureUncertainty(L, normClass, options?.tempVariation || 2.0, options?.customTK);
  const u_temp = tempRes.u_temp;

  // 6. Combined Standard Uncertainty u_c
  const varianceSum = Math.pow(u_rep, 2) + Math.pow(u_res, 2) + Math.pow(u_std, 2) + Math.pow(u_ecc, 2) + Math.pow(u_temp, 2);
  const u_c = Math.sqrt(varianceSum);

  // 7. Expanded Uncertainty U = k * u_c
  const expandedUncertainty = k * u_c;

  // 8. Welch-Satterthwaite Effective Degrees of Freedom
  let nu_eff = 999999;
  if (repRes.degreesOfFreedom > 0 && u_rep > 0 && Math.pow(u_c, 4) > 0) {
    const denominator = Math.pow(u_rep, 4) / repRes.degreesOfFreedom;
    if (denominator > 0) {
      nu_eff = Math.min(999999, Math.max(repRes.degreesOfFreedom, Math.pow(u_c, 4) / denominator));
    }
  }

  const relativeUncertaintyPercent = L > 0 ? (expandedUncertainty / L) * 100 : 0;

  return {
    standardUncertainty: roundTo(u_c, 6),
    combinedStandardUncertainty: roundTo(u_c, 6),
    expandedUncertainty: roundTo(expandedUncertainty, 6),
    expandedUncertaintyFormatted: `± ${roundTo(expandedUncertainty, 4)}`,
    coverageFactor: k,
    effectiveDOF: Math.round(nu_eff),
    components: {
      repeatability: roundTo(u_rep, 6),
      resolution: roundTo(u_res, 6),
      standardWeights: roundTo(u_std, 6),
      eccentricity: roundTo(u_ecc, 6),
      temperature: roundTo(u_temp, 6),
    },
    // Detailed analysis breakdown
    relativeUncertaintyPercent: roundTo(relativeUncertaintyPercent, 4),
    details: {
      appliedLoad: L,
      accuracyClass: normClass,
      u_c: roundTo(u_c, 8),
      U: roundTo(expandedUncertainty, 8),
      k,
      nu_eff: roundTo(nu_eff, 2),
      varianceSum: roundTo(varianceSum, 10),
      percentageContributions: {
        repeatability: varianceSum > 0 ? roundTo((Math.pow(u_rep, 2) / varianceSum) * 100, 2) : 0,
        resolution: varianceSum > 0 ? roundTo((Math.pow(u_res, 2) / varianceSum) * 100, 2) : 0,
        standardWeights: varianceSum > 0 ? roundTo((Math.pow(u_std, 2) / varianceSum) * 100, 2) : 0,
        eccentricity: varianceSum > 0 ? roundTo((Math.pow(u_ecc, 2) / varianceSum) * 100, 2) : 0,
        temperature: varianceSum > 0 ? roundTo((Math.pow(u_temp, 2) / varianceSum) * 100, 2) : 0,
      },
    },
  };
}

/**
 * Batch compute uncertainty budget across a range of calibration test loads
 * 
 * @param {Array<number>} loadPoints - Array of test loads
 * @param {Object} instrument - Instrument specifications
 * @param {Object} [testResults] - Test results from session (repeatability, eccentricity, etc.)
 * @returns {Array<Object>} Array of { load, budget }
 */
function computeCalibrationUncertaintyCurve(loadPoints = [], instrument = {}, testResults = {}) {
  const d = Number(instrument?.actualInterval || instrument?.verificationInterval || 0.001);
  const accuracyClass = instrument?.accuracyClass || 'CLASS_III';
  const ranges = instrument?.ranges || instrument?.multiIntervalRanges || null;

  // Extract repeatability standard deviation from test results if available
  let repStdDev = 0;
  if (testResults?.REPEATABILITY?.calculations?.maxStdDev) {
    repStdDev = testResults.REPEATABILITY.calculations.maxStdDev;
  }

  // Extract eccentricity maximum deviation if available
  let eccError = 0;
  if (testResults?.ECCENTRICITY?.calculations?.maxDifferenceFromCenter) {
    eccError = testResults.ECCENTRICITY.calculations.maxDifferenceFromCenter;
  }

  return loadPoints.map((load) => {
    const budget = computeExpandedUncertainty(repStdDev, d, load, accuracyClass, {
      eccError,
      ranges,
    });
    return {
      load: Number(load),
      ...budget,
    };
  });
}

module.exports = {
  TEMPERATURE_COEFFICIENT_TK,
  DEFAULT_WEIGHT_CLASS_BY_ACCURACY,
  computeRepeatabilityUncertainty,
  computeResolutionUncertainty,
  computeStandardWeightsUncertainty,
  computeEccentricityUncertainty,
  computeTemperatureUncertainty,
  computeExpandedUncertainty,
  calculateUncertaintyBudget: computeExpandedUncertainty,
  computeCalibrationUncertaintyCurve,
};
