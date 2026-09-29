/**
 * OIML R-76 Metrological Calculation Engine for Frontend (ES Module)
 * Compliant with OIML R 76-1:2006 (E)
 * Multi-Interval, Multi-Range, Subtractive/Additive Tare, Boundary Step Points, and Hysteresis
 */

export const ACCURACY_CLASSES = {
  CLASS_I: {
    label: 'Class I (Special Accuracy / Special)',
    short: 'Class I',
    zone1: 50000,
    zone2: 200000,
    minE: 100,
  },
  CLASS_II: {
    label: 'Class II (High Accuracy / High)',
    short: 'Class II',
    zone1: 5000,
    zone2: 20000,
    minE: 50,
  },
  CLASS_III: {
    label: 'Class III (Medium Accuracy / Medium)',
    short: 'Class III',
    zone1: 500,
    zone2: 2000,
    minE: 20,
  },
  CLASS_IIII: {
    label: 'Class IIII (Ordinary Accuracy / Ordinary)',
    short: 'Class IIII',
    zone1: 50,
    zone2: 200,
    minE: 10,
  },
};

/**
 * MPE Table Step Tiers in units of verification scale interval (e)
 */
export const MPE_TIERS = {
  CLASS_I: [
    { minLoad: 0, maxLoad: 50000, mpeInitial: 0.5, stepName: 'STEP_50000E' },
    { minLoad: 50000, maxLoad: 200000, mpeInitial: 1.0, stepName: 'STEP_200000E' },
    { minLoad: 200000, maxLoad: Infinity, mpeInitial: 1.5, stepName: 'ABOVE_200000E' },
  ],
  CLASS_II: [
    { minLoad: 0, maxLoad: 5000, mpeInitial: 0.5, stepName: 'STEP_5000E' },
    { minLoad: 5000, maxLoad: 20000, mpeInitial: 1.0, stepName: 'STEP_20000E' },
    { minLoad: 20000, maxLoad: 100000, mpeInitial: 1.5, stepName: 'STEP_100000E' },
  ],
  CLASS_III: [
    { minLoad: 0, maxLoad: 500, mpeInitial: 0.5, stepName: 'STEP_500E' },
    { minLoad: 500, maxLoad: 2000, mpeInitial: 1.0, stepName: 'STEP_2000E' },
    { minLoad: 2000, maxLoad: 10000, mpeInitial: 1.5, stepName: 'STEP_10000E' },
  ],
  CLASS_IIII: [
    { minLoad: 0, maxLoad: 50, mpeInitial: 0.5, stepName: 'STEP_50E' },
    { minLoad: 50, maxLoad: 200, mpeInitial: 1.0, stepName: 'STEP_200E' },
    { minLoad: 200, maxLoad: 1000, mpeInitial: 1.5, stepName: 'STEP_1000E' },
  ],
};

/**
 * Returns Maximum Permissible Error (MPE) in units of verification scale interval (e)
 */
export function getMPEFactor(accuracyClass, loadInE, isInService = false) {
  const normClass = String(accuracyClass || 'CLASS_III').toUpperCase();
  const tiers = MPE_TIERS[normClass] || MPE_TIERS.CLASS_III;
  const absLoad = Math.abs(Number(loadInE) || 0);

  let baseMpe = 1.5;
  for (const tier of tiers) {
    if (absLoad >= tier.minLoad && absLoad <= tier.maxLoad) {
      baseMpe = tier.mpeInitial;
      break;
    }
  }

  return isInService ? baseMpe * 2 : baseMpe;
}

/**
 * Calculate tare capacity adjustments per OIML R-76 clause 3.5.3.3 & 3.5.3.4
 * - Subtractive tare: Max_net = Max - T
 * - Additive tare: Max_gross = Max + T
 */
export function calculateTareCapacities(maxCapacity, tare) {
  const max = Number(maxCapacity) || 0;
  if (!tare) {
    return {
      tareValue: 0,
      tareType: 'SUBTRACTIVE',
      maxNet: max,
      maxGross: max,
      isTareActive: false,
    };
  }

  const tareValue = Math.abs(typeof tare === 'object' ? Number(tare.value || 0) : Number(tare || 0));
  const tareType = typeof tare === 'object' && tare.type ? String(tare.type).toUpperCase() : 'SUBTRACTIVE';
  const isTareActive = tareValue > 0;

  let maxNet = max;
  let maxGross = max;

  if (tareType === 'ADDITIVE') {
    maxNet = max;
    maxGross = max + tareValue;
  } else {
    maxNet = Math.max(0, max - tareValue);
    maxGross = max;
  }

  return {
    tareValue,
    tareType,
    maxNet: roundTo(maxNet, 6),
    maxGross: roundTo(maxGross, 6),
    isTareActive,
  };
}

/**
 * Normalizes ranges from various input shapes
 */
export function normalizeRanges(rangesInput, defaultE = 0.001) {
  if (Array.isArray(rangesInput) && rangesInput.length > 0) {
    return rangesInput.map((r, idx) => ({
      index: idx,
      max: Number(r.max ?? r.maxCapacity ?? Infinity),
      e: Number(r.e ?? r.verificationInterval ?? defaultE),
      d: Number(r.d ?? r.actualInterval ?? r.e ?? defaultE),
      min: Number(r.min ?? r.minCapacity ?? 0),
    })).sort((a, b) => a.max - b.max);
  }

  if (typeof rangesInput === 'number' && rangesInput > 0) {
    return [{ index: 0, max: Infinity, e: rangesInput, d: rangesInput, min: 0 }];
  }

  if (rangesInput && typeof rangesInput === 'object') {
    if (Array.isArray(rangesInput.ranges) && rangesInput.ranges.length > 0) {
      return normalizeRanges(rangesInput.ranges, defaultE);
    }
    if (Array.isArray(rangesInput.multiIntervalRanges) && rangesInput.multiIntervalRanges.length > 0) {
      return normalizeRanges(rangesInput.multiIntervalRanges, defaultE);
    }
    const eVal = Number(rangesInput.e ?? rangesInput.verificationInterval ?? rangesInput.verificationScaleInterval_e ?? defaultE);
    const maxVal = Number(rangesInput.max ?? rangesInput.maxCapacity ?? Infinity);
    const minVal = Number(rangesInput.min ?? rangesInput.minCapacity ?? 0);
    const dVal = Number(rangesInput.d ?? rangesInput.actualInterval ?? rangesInput.actualScaleInterval_d ?? eVal);
    return [{ index: 0, max: maxVal, e: eVal, d: dVal, min: minVal }];
  }

  return [{ index: 0, max: Infinity, e: defaultE, d: defaultE, min: 0 }];
}

/**
 * Multi-Interval and Multi-Range MPE calculation
 * 
 * @param {number} load - Applied net or gross load
 * @param {string} accuracyClass - 'CLASS_I' | 'CLASS_II' | 'CLASS_III' | 'CLASS_IIII'
 * @param {Array<Object>|Object|number} [ranges] - Array of { max, e, d, min } or instrument
 * @param {boolean} [isInService=false] - In-service 2x multiplier
 * @param {Object|number} [tare] - Tare configuration
 * @returns {Object} { mpe, mpeInE, currentRangeIndex, currentE, rangeMax, effectiveLoad, grossLoad, netLoad }
 */
export function calculateMultiIntervalMPE(load, accuracyClass = 'CLASS_III', ranges = null, isInService = false, tare = null) {
  const normClass = String(accuracyClass || 'CLASS_III').toUpperCase();
  const netLoad = Math.abs(Number(load) || 0);

  const sortedRanges = normalizeRanges(ranges);
  const highestMax = sortedRanges[sortedRanges.length - 1].max;

  const tareInfo = calculateTareCapacities(highestMax !== Infinity ? highestMax : 100, tare);
  const grossLoad = tareInfo.isTareActive ? netLoad + tareInfo.tareValue : netLoad;
  const effectiveEvaluationLoad = grossLoad;

  let activeRange = sortedRanges[0];
  let activeIndex = 0;

  for (let i = 0; i < sortedRanges.length; i++) {
    const r = sortedRanges[i];
    activeRange = r;
    activeIndex = i;
    if (effectiveEvaluationLoad <= r.max + 1e-9) {
      break;
    }
  }

  const currentE = activeRange.e;
  const loadInE = effectiveEvaluationLoad / currentE;
  const mpeInE = getMPEFactor(normClass, loadInE, isInService);
  const mpe = roundTo(mpeInE * currentE, 6);

  return {
    mpe,
    mpeInE,
    currentRangeIndex: activeIndex,
    currentE,
    currentD: activeRange.d,
    rangeMax: activeRange.max,
    rangeMin: activeRange.min,
    effectiveLoad: roundTo(effectiveEvaluationLoad, 6),
    grossLoad: roundTo(grossLoad, 6),
    netLoad: roundTo(netLoad, 6),
    tareInfo,
  };
}

/**
 * Standard MPE Calculation for frontend
 * Backwards-compatible signature: calculateMpe(load, e, accuracyClass, isInitialVerification, ranges, tare)
 */
export function calculateMpe(
  load,
  e,
  accuracyClass = 'CLASS_III',
  isInitialVerification = true,
  ranges = null,
  tare = null
) {
  if (load === undefined || load === null) return 0;
  const isInService = !isInitialVerification;
  const activeRanges = ranges || (e ? [{ max: Infinity, e }] : null);

  const multi = calculateMultiIntervalMPE(load, accuracyClass, activeRanges, isInService, tare);
  return multi.mpe;
}

/**
 * Calculate continuous indication P per OIML R-76 §A.4.4.3
 * P = I + 0.5e - ΔL
 */
export function calculateContinuousIndication(indicatedValue, e, deltaL = 0) {
  const I = Number(indicatedValue) || 0;
  const scaleE = Number(e) || 0;
  const dL = Number(deltaL) || 0;
  return roundTo(I + 0.5 * scaleE - dL, 6);
}

/**
 * Calculate error E and corrected error Ec
 * E = P - L
 * Ec = E - E0
 */
export function calculateCorrectedError(continuousIndication, nominalLoad, zeroErrorE0 = 0) {
  const P = Number(continuousIndication) || 0;
  const L = Number(nominalLoad) || 0;
  const E0 = Number(zeroErrorE0) || 0;

  const E = roundTo(P - L, 6);
  const Ec = roundTo(E - E0, 6);

  return { E, Ec };
}

/**
 * Generate exact OIML R-76 Boundary Load Step Points
 */
export function generateBoundaryLoadPoints(instrument, options = {}) {
  const normClass = String(instrument?.accuracyClass || 'CLASS_III').toUpperCase();
  const ranges = instrument?.ranges || instrument?.multiIntervalRanges || null;
  const isInService = Boolean(options.isInService);

  if (ranges && Array.isArray(ranges) && ranges.length > 1) {
    const sortedRanges = [...ranges].sort((a, b) => (a.max || a.maxCapacity) - (b.max || b.maxCapacity));
    const points = [];

    points.push({
      stepType: 'ZERO',
      nominalLoad: 0,
      description: 'Zero Load Baseline',
      rangeIndex: 0,
      e: sortedRanges[0].e || sortedRanges[0].verificationInterval,
      mpe: 0,
      mpeInE: getMPEFactor(normClass, 0, isInService),
    });

    sortedRanges.forEach((range, rIdx) => {
      const e = Number(range.e || range.verificationInterval || 0.001);
      const max = Number(range.max || range.maxCapacity);
      const min = Number(range.min || range.minCapacity || (e * (ACCURACY_CLASSES[normClass]?.minE || 20)));

      if (rIdx === 0) {
        const mpeCalcMin = calculateMultiIntervalMPE(min, normClass, sortedRanges, isInService);
        points.push({
          stepType: 'MIN',
          nominalLoad: min,
          description: `Minimum Capacity (Min = ${min})`,
          rangeIndex: rIdx,
          e,
          mpe: mpeCalcMin.mpe,
          mpeInE: mpeCalcMin.mpeInE,
        });
      }

      const stepTiers = MPE_TIERS[normClass] || MPE_TIERS.CLASS_III;
      stepTiers.forEach((tier) => {
        if (tier.maxLoad < Infinity && tier.maxLoad > 0) {
          const boundaryLoad = tier.maxLoad * e;
          if (boundaryLoad > min && boundaryLoad < max && !points.some(p => Math.abs(p.nominalLoad - boundaryLoad) < 1e-6)) {
            const mpeCalc = calculateMultiIntervalMPE(boundaryLoad, normClass, sortedRanges, isInService);
            points.push({
              stepType: tier.stepName || 'BOUNDARY_STEP',
              nominalLoad: boundaryLoad,
              description: `MPE Step Point (${tier.maxLoad}e = ${boundaryLoad})`,
              rangeIndex: rIdx,
              e,
              mpe: mpeCalc.mpe,
              mpeInE: mpeCalc.mpeInE,
            });
          }
        }
      });

      const mpeCalcMax = calculateMultiIntervalMPE(max, normClass, sortedRanges, isInService);
      points.push({
        stepType: rIdx === sortedRanges.length - 1 ? 'MAX' : 'SWITCHING_POINT',
        nominalLoad: max,
        description: rIdx === sortedRanges.length - 1 ? `Maximum Capacity (Max = ${max})` : `Partial Range Max ${rIdx + 1} (Max_${rIdx + 1} = ${max})`,
        rangeIndex: rIdx,
        e,
        mpe: mpeCalcMax.mpe,
        mpeInE: mpeCalcMax.mpeInE,
      });
    });

    return points;
  }

  const max = Number(instrument?.maxCapacity || 100);
  const e = Number(instrument?.verificationInterval || instrument?.verificationScaleInterval_e || 0.001);
  const minDefault = e * (ACCURACY_CLASSES[normClass]?.minE || 20);
  const min = Number(instrument?.minCapacity || minDefault);

  const rawPoints = [];

  rawPoints.push({
    stepType: 'ZERO',
    nominalLoad: 0,
    description: 'Zero Load (Initial Baseline)',
    e,
    mpeInE: getMPEFactor(normClass, 0, isInService),
    mpe: roundTo(getMPEFactor(normClass, 0, isInService) * e, 6),
  });

  if (min > 0 && min < max) {
    const mpeInE = getMPEFactor(normClass, min / e, isInService);
    rawPoints.push({
      stepType: 'MIN',
      nominalLoad: min,
      description: `Minimum Capacity (Min = ${min})`,
      e,
      mpeInE,
      mpe: roundTo(mpeInE * e, 6),
    });
  }

  const tiers = MPE_TIERS[normClass] || MPE_TIERS.CLASS_III;
  tiers.forEach((tier) => {
    if (tier.maxLoad < Infinity && tier.maxLoad > 0) {
      const stepLoad = tier.maxLoad * e;
      if (stepLoad > min && stepLoad < max && !rawPoints.some(p => Math.abs(p.nominalLoad - stepLoad) < 1e-6)) {
        const mpeInE = getMPEFactor(normClass, stepLoad / e, isInService);
        rawPoints.push({
          stepType: tier.stepName || 'BOUNDARY_STEP',
          nominalLoad: stepLoad,
          description: `OIML Boundary Step (${tier.maxLoad}e = ${stepLoad})`,
          e,
          mpeInE,
          mpe: roundTo(mpeInE * e, 6),
        });
      }
    }
  });

  const halfMax = roundTo(max * 0.5, 4);
  if (halfMax > min && halfMax < max && !rawPoints.some((p) => Math.abs(p.nominalLoad - halfMax) < 1e-9)) {
    const mpeInE = getMPEFactor(normClass, halfMax / e, isInService);
    rawPoints.push({
      stepType: 'HALF_MAX',
      nominalLoad: halfMax,
      description: `50% Maximum Capacity (${halfMax})`,
      e,
      mpeInE,
      mpe: roundTo(mpeInE * e, 6),
    });
  }

  const maxMpeInE = getMPEFactor(normClass, max / e, isInService);
  rawPoints.push({
    stepType: 'MAX',
    nominalLoad: max,
    description: `Maximum Capacity (Max = ${max})`,
    e,
    mpeInE: maxMpeInE,
    mpe: roundTo(maxMpeInE * e, 6),
  });

  return rawPoints.sort((a, b) => a.nominalLoad - b.nominalLoad);
}

/**
 * Validate hysteresis per OIML R-76 clause 3.6.1: Hys(L) = |P_dec(L) - P_inc(L)| <= MPE(L)
 */
export function validateHysteresis(increasingPoints = [], decreasingPoints = [], instrument = {}, isInService = false, ranges = null, tare = null) {
  const accuracyClass = instrument?.accuracyClass || 'CLASS_III';
  const e = Number(instrument?.verificationInterval || instrument?.verificationScaleInterval_e) || 0.001;
  const activeRanges = ranges || instrument?.ranges || instrument?.multiIntervalRanges || [{ max: Infinity, e }];

  let overallPass = true;
  let maxHysteresis = 0;
  let maxMpeAllowed = 0;

  const evaluations = [];

  increasingPoints.forEach((incPt) => {
    const load = Number(incPt.appliedLoad ?? incPt.load) || 0;
    const decPt = decreasingPoints.find((dp) => Math.abs(Number(dp.appliedLoad ?? dp.load) - load) < 1e-6);

    if (decPt) {
      const pInc = incPt.continuousIndication != null ? Number(incPt.continuousIndication) : calculateContinuousIndication(incPt.indicatedValue ?? incPt.incReading, e, incPt.deltaL);
      const pDec = decPt.continuousIndication != null ? Number(decPt.continuousIndication) : calculateContinuousIndication(decPt.indicatedValue ?? decPt.decReading, e, decPt.deltaL);

      const hysteresis = roundTo(Math.abs(pDec - pInc), 6);
      const mpeInfo = calculateMultiIntervalMPE(load, accuracyClass, activeRanges, isInService, tare);
      const mpe = mpeInfo.mpe;

      const passed = hysteresis <= mpe + 1e-9;
      if (!passed) {
        overallPass = false;
      }

      if (hysteresis > maxHysteresis) maxHysteresis = hysteresis;
      if (mpe > maxMpeAllowed) maxMpeAllowed = mpe;

      evaluations.push({
        appliedLoad: load,
        pInc,
        pDec,
        hysteresis,
        mpe,
        mpeInE: mpeInfo.mpeInE,
        currentRangeIndex: mpeInfo.currentRangeIndex,
        passed,
      });
    }
  });

  return {
    evaluations,
    maxHysteresis: roundTo(maxHysteresis, 6),
    maxMpeAllowed: roundTo(maxMpeAllowed, 6),
    overallPass,
  };
}

/**
 * Format float numbers nicely to fixed decimal places or trimmed string
 */
export function roundTo(val, decimals = 4) {
  if (val === undefined || val === null || isNaN(val)) return 0;
  const factor = Math.pow(10, decimals);
  return Math.round((Number(val) + Number.EPSILON) * factor) / factor;
}

export function formatNumber(val, decimals = 2) {
  if (val === undefined || val === null || isNaN(val)) return '-';
  return Number(val).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  });
}
