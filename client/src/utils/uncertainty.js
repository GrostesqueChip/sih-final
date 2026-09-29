/**
 * ISO GUM / EURAMET cg-18 Compliant Measurement Uncertainty Engine for Frontend (ES Module)
 * Reference:
 * - JCGM 100:2008 / ISO/IEC Guide 98-3:2008 (GUM)
 * - EURAMET cg-18 (Version 4.0, 11/2015): Guidelines on the Calibration of Non-Automatic Weighing Instruments
 * - OIML R 111-1:2004 (Weights classes E1, E2, F1, F2, M1, M2, M3)
 */

import { calculateMultiIntervalMPE, roundTo } from './metrology.js';

export const TEMPERATURE_COEFFICIENT_TK = {
  CLASS_I: 1.0e-6,
  CLASS_II: 2.0e-6,
  CLASS_III: 1.0e-5,
  CLASS_IIII: 2.0e-5,
};

export const DEFAULT_WEIGHT_CLASS_BY_ACCURACY = {
  CLASS_I: 'E2',
  CLASS_II: 'F1',
  CLASS_III: 'M1',
  CLASS_IIII: 'M2',
};

/**
 * 1. Compute Type A Standard Uncertainty from Repeatability Measurements
 * u_rep = s (sample standard deviation)
 */
export function computeRepeatabilityUncertainty(repeatabilityInput, d = 0.001, nReadings = 6) {
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
 * u_res = d / (2 * sqrt(3))
 */
export function computeResolutionUncertainty(d) {
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
 * u_std = MPE_std / sqrt(3) or U_std / 2
 */
export function computeStandardWeightsUncertainty(appliedLoad, accuracyClass = 'CLASS_III', options = {}) {
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
 * 4. Compute Eccentricity Standard Uncertainty
 * u_ecc = |Delta I_ecc| / (2 * L_ecc * sqrt(3)) * L
 */
export function computeEccentricityUncertainty(appliedLoad, eccError = 0, eccLoad = null) {
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
 * u_temp = (TK_c * L * Delta_T) / sqrt(3)
 */
export function computeTemperatureUncertainty(appliedLoad, accuracyClass = 'CLASS_III', tempVariation = 2.0, customTK = null) {
  const L = Math.abs(Number(appliedLoad) || 0);
  const normClass = String(accuracyClass || 'CLASS_III').toUpperCase();
  const tk_c = Number(customTK) || TEMPERATURE_COEFFICIENT_TK[normClass] || 1.0e-5;
  const deltaT = Math.abs(Number(tempVariation) || 2.0);

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
 * Compute ISO GUM / EURAMET cg-18 Expanded Uncertainty Budget
 * Matches PROJECT.md interface contract:
 * {
 *   standardUncertainty: number, // u_c
 *   expandedUncertainty: number, // U = k * u_c
 *   coverageFactor: number,      // k = 2
 *   effectiveDOF: number,        // degrees of freedom
 *   components: {
 *     repeatability: number,
 *     resolution: number,
 *     standardWeights: number,
 *     eccentricity: number,
 *     temperature: number,
 *   }
 * }
 */
export function computeExpandedUncertainty(
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

  const repRes = computeRepeatabilityUncertainty(repeatabilityStdDev, d, nReadings);
  const u_rep = repRes.u_rep;

  const resRes = computeResolutionUncertainty(d);
  const u_res = resRes.u_res;

  const stdRes = computeStandardWeightsUncertainty(L, normClass, {
    standardWeightMpe: options?.standardWeightMpe,
    standardWeightU: options?.standardWeightU,
    e: d,
    ranges: options?.ranges,
  });
  const u_std = stdRes.u_std;

  const eccRes = computeEccentricityUncertainty(L, options?.eccError || options?.eccentricityError || 0, options?.eccLoad);
  const u_ecc = eccRes.u_ecc;

  const tempRes = computeTemperatureUncertainty(L, normClass, options?.tempVariation || 2.0, options?.customTK);
  const u_temp = tempRes.u_temp;

  const varianceSum = Math.pow(u_rep, 2) + Math.pow(u_res, 2) + Math.pow(u_std, 2) + Math.pow(u_ecc, 2) + Math.pow(u_temp, 2);
  const u_c = Math.sqrt(varianceSum);
  const expandedUncertainty = k * u_c;

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
    expandedUncertainty: roundTo(expandedUncertainty, 6),
    coverageFactor: k,
    effectiveDOF: Math.round(nu_eff),
    components: {
      repeatability: roundTo(u_rep, 6),
      resolution: roundTo(u_res, 6),
      standardWeights: roundTo(u_std, 6),
      eccentricity: roundTo(u_ecc, 6),
      temperature: roundTo(u_temp, 6),
    },
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

export const calculateUncertaintyBudget = computeExpandedUncertainty;

/**
 * Batch compute uncertainty budget across a range of calibration test loads
 */
export function computeCalibrationUncertaintyCurve(loadPoints = [], instrument = {}, testResults = {}) {
  const d = Number(instrument?.actualInterval || instrument?.verificationInterval || instrument?.actualScaleInterval_d || 0.001);
  const accuracyClass = instrument?.accuracyClass || 'CLASS_III';
  const ranges = instrument?.ranges || instrument?.multiIntervalRanges || null;

  let repStdDev = 0;
  if (testResults?.REPEATABILITY?.calculations?.maxStdDev) {
    repStdDev = testResults.REPEATABILITY.calculations.maxStdDev;
  }

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
