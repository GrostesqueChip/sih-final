/**
 * OIML R-76 Metrological Calculation Engine
 * Reference: OIML R 76-1:2006 (Non-automatic weighing instruments - Part 1: Metrological and technical requirements)
 * Table 3: Maximum permissible errors on initial verification
 * Clause 3.4: Multi-interval and multiple-range instruments
 * Clause 3.5.3: Tare devices (Subtractive and Additive tare MPE rules)
 * Clause 3.6.1: Hysteresis error limits
 */

// MPE limits by accuracy class and load range in units of verification interval (e)
const MPE_TABLE = {
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

// Minimum capacity multipliers in units of e per OIML R-76 Table 3
const MIN_CAPACITY_IN_E = {
  CLASS_I: 100,
  CLASS_II: 50,
  CLASS_III: 20,
  CLASS_IIII: 10,
};

/**
 * Returns Maximum Permissible Error (MPE) in units of verification scale interval (e).
 * Per OIML R-76-1 clause 3.5.2, in-service MPE is 2 * initial verification MPE.
 * 
 * @param {string} accuracyClass - 'CLASS_I', 'CLASS_II', 'CLASS_III', 'CLASS_IIII'
 * @param {number} loadInE - Applied load normalized to verification interval (Load / e)
 * @param {boolean} [isInService=false] - Whether in-service limits apply
 * @returns {number} MPE in units of e (e.g. 0.5, 1.0, 1.5 or 1.0, 2.0, 3.0)
 */
function getMPE(accuracyClass, loadInE, isInService = false) {
  const normClass = String(accuracyClass || 'CLASS_III').toUpperCase();
  const tiers = MPE_TABLE[normClass] || MPE_TABLE.CLASS_III;
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
 * 
 * @param {number} maxCapacity - Scale maximum capacity Max
 * @param {Object|number} [tare] - { value: number, type: 'SUBTRACTIVE' | 'ADDITIVE' } or number
 * @returns {Object} { tareValue, tareType, maxNet, maxGross, isTareActive }
 */
function calculateTareCapacities(maxCapacity, tare) {
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
  const tareType = (typeof tare === 'object' && tare.type ? String(tare.type).toUpperCase() : 'SUBTRACTIVE');
  const isTareActive = tareValue > 0;

  let maxNet = max;
  let maxGross = max;

  if (tareType === 'ADDITIVE') {
    maxNet = max;
    maxGross = max + tareValue;
  } else {
    // SUBTRACTIVE
    maxNet = Math.max(0, max - tareValue);
    maxGross = max;
  }

  return {
    tareValue,
    tareType,
    maxNet: Number(maxNet.toFixed(8)),
    maxGross: Number(maxGross.toFixed(8)),
    isTareActive,
  };
}

/**
 * Normalizes ranges from various input shapes (array of ranges, instrument object, or single e)
 */
function normalizeRanges(rangesInput, defaultE = 0.001) {
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
 * Calculate Multi-Interval and Multi-Range MPE per OIML R-76 clause 3.4 & Table 3
 * 
 * On a multi-interval instrument with ranges [Max1, Max2, ... Maxr] and intervals [e1, e2, ... er]:
 * - For load L (or gross load L + T when tare is active per clause 3.5.3.4):
 *   Identify the active partial weighing range i where Maxi-1 < L <= Maxi.
 *   Verification interval ei is applied.
 *   Load in verification intervals is m = L / ei.
 *   MPE is determined from Table 3 for class and scaled by ei: MPE = getMPE(class, m) * ei.
 * 
 * @param {number} load - Applied net or gross load
 * @param {string} accuracyClass - 'CLASS_I' | 'CLASS_II' | 'CLASS_III' | 'CLASS_IIII'
 * @param {Array<Object>|Object|number} [ranges] - Array of { max, e, d, min } or instrument
 * @param {boolean} [isInService=false] - In-service 2x factor
 * @param {Object|number} [tare] - { value: number, type: 'SUBTRACTIVE' | 'ADDITIVE' }
 * @returns {Object} { mpe, mpeInE, currentRangeIndex, currentE, rangeMax, effectiveLoad, grossLoad, netLoad }
 */
function calculateMultiIntervalMPE(load, accuracyClass = 'CLASS_III', ranges = null, isInService = false, tare = null) {
  const normClass = String(accuracyClass || 'CLASS_III').toUpperCase();
  const netLoad = Math.abs(Number(load) || 0);

  const sortedRanges = normalizeRanges(ranges);
  const highestMax = sortedRanges[sortedRanges.length - 1].max;

  // Process tare adjustment
  const tareInfo = calculateTareCapacities(highestMax !== Infinity ? highestMax : 100, tare);
  
  // Per OIML R-76 clause 3.5.3.4, MPE for net load corresponds to MPE for gross load = net + tare
  const grossLoad = tareInfo.isTareActive ? netLoad + tareInfo.tareValue : netLoad;
  const effectiveEvaluationLoad = grossLoad;

  // Find active range for effectiveEvaluationLoad
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
  const mpeInE = getMPE(normClass, loadInE, isInService);
  const mpe = Number((mpeInE * currentE).toFixed(8));

  return {
    mpe,
    mpeInE,
    currentRangeIndex: activeIndex,
    currentE,
    currentD: activeRange.d,
    rangeMax: activeRange.max,
    rangeMin: activeRange.min,
    effectiveLoad: Number(effectiveEvaluationLoad.toFixed(8)),
    grossLoad: Number(grossLoad.toFixed(8)),
    netLoad: Number(netLoad.toFixed(8)),
    tareInfo,
  };
}

/**
 * Helper to compute MPE taking into account single-range or multi-interval and tare
 */
function getTareAdjustedMPE(load, accuracyClass, e, tare = null, isInService = false, ranges = null) {
  const activeRanges = ranges || (e ? [{ max: Infinity, e }] : null);
  return calculateMultiIntervalMPE(load, accuracyClass, activeRanges, isInService, tare);
}

/**
 * Generate exact OIML R-76 Boundary Load Step Points (500e, 2000e, 10000e, Min, Max)
 * 
 * @param {Object} instrument - { accuracyClass, maxCapacity, minCapacity, verificationInterval, ranges }
 * @param {Object} [options] - { includeSwitchingTransitions: boolean, isInService: boolean }
 * @returns {Array<Object>} Array of boundary test point definitions
 */
function generateBoundaryLoadPoints(instrument, options = {}) {
  const normClass = String(instrument?.accuracyClass || 'CLASS_III').toUpperCase();
  const ranges = instrument?.ranges || instrument?.multiIntervalRanges || null;
  const isInService = Boolean(options.isInService);

  // If multi-interval instrument with multiple ranges
  if (ranges && Array.isArray(ranges) && ranges.length > 1) {
    const sortedRanges = [...ranges].sort((a, b) => (a.max || a.maxCapacity) - (b.max || b.maxCapacity));
    const points = [];

    // Initial Zero
    points.push({
      stepType: 'ZERO',
      nominalLoad: 0,
      description: 'Zero Load Baseline',
      rangeIndex: 0,
      e: sortedRanges[0].e || sortedRanges[0].verificationInterval,
      mpe: 0,
      mpeInE: getMPE(normClass, 0, isInService),
    });

    sortedRanges.forEach((range, rIdx) => {
      const e = Number(range.e || range.verificationInterval || 0.001);
      const max = Number(range.max || range.maxCapacity);
      const min = Number(range.min || range.minCapacity || (e * (MIN_CAPACITY_IN_E[normClass] || 20)));

      // Range Min Point
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

      // Key boundary loads within range (at tier.maxLoad e.g. 500e, 2000e)
      const stepTiers = MPE_TABLE[normClass] || MPE_TABLE.CLASS_III;
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

      // Range switching / max capacity point
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

  // Single Range Scale
  const max = Number(instrument?.maxCapacity || 100);
  const e = Number(instrument?.verificationInterval || instrument?.verificationScaleInterval_e || 0.001);
  const minDefault = e * (MIN_CAPACITY_IN_E[normClass] || 20);
  const min = Number(instrument?.minCapacity || minDefault);

  const rawPoints = [];

  // Zero
  rawPoints.push({
    stepType: 'ZERO',
    nominalLoad: 0,
    description: 'Zero Load (Initial Baseline)',
    e,
    mpeInE: getMPE(normClass, 0, isInService),
    mpe: Number((getMPE(normClass, 0, isInService) * e).toFixed(8)),
  });

  // Min
  if (min > 0 && min < max) {
    const mpeInE = getMPE(normClass, min / e, isInService);
    rawPoints.push({
      stepType: 'MIN',
      nominalLoad: min,
      description: `Minimum Capacity (Min = ${min})`,
      e,
      mpeInE,
      mpe: Number((mpeInE * e).toFixed(8)),
    });
  }

  // Step points from class table (e.g. 500e, 2000e, 10000e for Class III)
  const tiers = MPE_TABLE[normClass] || MPE_TABLE.CLASS_III;
  tiers.forEach((tier) => {
    if (tier.maxLoad < Infinity && tier.maxLoad > 0) {
      const stepLoad = tier.maxLoad * e;
      if (stepLoad > min && stepLoad < max && !rawPoints.some(p => Math.abs(p.nominalLoad - stepLoad) < 1e-6)) {
        const mpeInE = getMPE(normClass, stepLoad / e, isInService);
        rawPoints.push({
          stepType: tier.stepName || 'BOUNDARY_STEP',
          nominalLoad: stepLoad,
          description: `OIML Boundary Step (${tier.maxLoad}e = ${stepLoad})`,
          e,
          mpeInE,
          mpe: Number((mpeInE * e).toFixed(8)),
        });
      }
    }
  });

  // 50% Max
  const halfMax = Number((max * 0.5).toFixed(8));
  if (halfMax > min && halfMax < max && !rawPoints.some((p) => Math.abs(p.nominalLoad - halfMax) < 1e-9)) {
    const mpeInE = getMPE(normClass, halfMax / e, isInService);
    rawPoints.push({
      stepType: 'HALF_MAX',
      nominalLoad: halfMax,
      description: `50% Maximum Capacity (${halfMax})`,
      e,
      mpeInE,
      mpe: Number((mpeInE * e).toFixed(8)),
    });
  }

  // Max
  const maxMpeInE = getMPE(normClass, max / e, isInService);
  rawPoints.push({
    stepType: 'MAX',
    nominalLoad: max,
    description: `Maximum Capacity (Max = ${max})`,
    e,
    mpeInE: maxMpeInE,
    mpe: Number((maxMpeInE * e).toFixed(8)),
  });

  // Sort ascending by nominal load
  return rawPoints.sort((a, b) => a.nominalLoad - b.nominalLoad);
}

/**
 * Helper to calculate continuous indication P and error E using turning points (OIML R-76 A.4.4.3)
 * Formula: P = I + 0.5e - deltaL
 * Error: E = P - L
 */
function calculateIndicationAndError(appliedLoad, indicatedValue, verificationInterval, deltaL) {
  const L = Number(appliedLoad) || 0;
  const I = Number(indicatedValue) || 0;
  const e = Number(verificationInterval) || 1;

  let P = I;
  if (deltaL !== undefined && deltaL !== null && !isNaN(Number(deltaL))) {
    P = I + 0.5 * e - Number(deltaL);
  }

  const E = P - L;
  return { continuousIndication: Number(P.toFixed(8)), error: Number(E.toFixed(8)) };
}

/**
 * Hysteresis validation per OIML R-76 clause 3.6.1 & A.4.4.3
 * Formula: Hys(L) = |P_dec(L) - P_inc(L)| <= MPE(L)
 * 
 * @param {Array<Object>} increasingPoints - Array of { appliedLoad, indicatedValue, deltaL, continuousIndication }
 * @param {Array<Object>} decreasingPoints - Array of { appliedLoad, indicatedValue, deltaL, continuousIndication }
 * @param {Object} instrument - Instrument specifications
 * @param {boolean} [isInService=false]
 * @param {Array<Object>} [ranges] - Multi-interval ranges
 * @param {Object|number} [tare] - Tare configuration
 * @returns {Object} { evaluations, maxHysteresis, maxMpeAllowed, overallPass }
 */
function validateHysteresis(increasingPoints = [], decreasingPoints = [], instrument = {}, isInService = false, ranges = null, tare = null) {
  const accuracyClass = instrument?.accuracyClass || 'CLASS_III';
  const e = Number(instrument?.verificationInterval || instrument?.verificationScaleInterval_e) || 0.001;
  const activeRanges = ranges || instrument?.ranges || instrument?.multiIntervalRanges || [{ max: Infinity, e }];

  let overallPass = true;
  let maxHysteresis = 0;
  let maxMpeAllowed = 0;

  const evaluations = [];

  // Match increasing and decreasing points by applied load
  increasingPoints.forEach((incPt) => {
    const load = Number(incPt.appliedLoad ?? incPt.load) || 0;
    // Find matching decreasing point within small numerical epsilon
    const decPt = decreasingPoints.find((dp) => Math.abs(Number(dp.appliedLoad ?? dp.load) - load) < 1e-6);

    if (decPt) {
      const pInc = incPt.continuousIndication != null ? Number(incPt.continuousIndication) : calculateIndicationAndError(load, incPt.indicatedValue ?? incPt.incReading, e, incPt.deltaL).continuousIndication;
      const pDec = decPt.continuousIndication != null ? Number(decPt.continuousIndication) : calculateIndicationAndError(load, decPt.indicatedValue ?? decPt.decReading, e, decPt.deltaL).continuousIndication;

      const hysteresis = Number(Math.abs(pDec - pInc).toFixed(8));

      // Calculate MPE for this load
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
    maxHysteresis: Number(maxHysteresis.toFixed(8)),
    maxMpeAllowed: Number(maxMpeAllowed.toFixed(8)),
    overallPass,
  };
}

/**
 * 1. Weighing Performance Test Calculation
 * Evaluates error curve across increasing and decreasing loads, verifies multi-interval MPEs,
 * subtractive/additive tare adjustments, and validates hysteresis.
 * 
 * @param {Object|Array} data - Array of points or { points: [...], tare: { value, type } }
 * @param {Object} instrument - Instrument specifications (verificationInterval, accuracyClass, ranges, etc.)
 * @param {boolean} [isInService=false]
 * @param {Object|number} [tare]
 */
function calculateWeighingPerformance(data, instrument, isInService = false, tare = null) {
  const points = Array.isArray(data) ? data : data?.points || [];
  const tareData = tare || data?.tare || instrument?.tare || null;
  const defaultE = Number(instrument?.verificationInterval || instrument?.verificationScaleInterval_e) || 0.001;
  const accuracyClass = instrument?.accuracyClass || 'CLASS_III';
  const ranges = instrument?.ranges || instrument?.multiIntervalRanges || [{ max: Infinity, e: defaultE }];

  if (!points.length) {
    return {
      points: [],
      maxCorrectedError: 0,
      maxMpeAllowed: 0,
      hysteresisAnalysis: { evaluations: [], maxHysteresis: 0, maxMpeAllowed: 0, overallPass: true },
      tareAnalysis: calculateTareCapacities(instrument?.maxCapacity || 0, tareData),
      overallPass: false,
      summary: 'No test measurement points provided.',
    };
  }

  // Find zero error (E0) at initial zero load
  const zeroPoint = points.find(p => Number(p.appliedLoad) === 0 && (p.isIncreasing === true || p.isIncreasing === undefined));
  let zeroError = 0;
  if (zeroPoint) {
    const { error } = calculateIndicationAndError(0, zeroPoint.indicatedValue, defaultE, zeroPoint.deltaL);
    zeroError = error;
  }

  let overallPass = true;
  let maxCorrectedError = 0;
  let maxMpeAllowed = 0;

  const evaluatedPoints = points.map((p, idx) => {
    const appliedLoad = Number(p.appliedLoad) || 0;
    const indicatedValue = Number(p.indicatedValue) || 0;
    const isIncreasing = p.isIncreasing !== false;
    const deltaL = p.deltaL;

    // Determine verification interval e for this load point
    const mpeInfo = calculateMultiIntervalMPE(appliedLoad, accuracyClass, ranges, isInService, tareData);
    const activeE = mpeInfo.currentE || defaultE;

    const { continuousIndication, error } = calculateIndicationAndError(appliedLoad, indicatedValue, activeE, deltaL);
    
    // Corrected error Ec = E - E0 (OIML R-76 A.4.4.3)
    const correctedError = Number((error - zeroError).toFixed(8));
    
    // MPE in mass units
    const mpeMass = mpeInfo.mpe;
    const mpeE = mpeInfo.mpeInE;

    // Tolerance check (with micro-epsilon for floating point)
    const passed = Math.abs(correctedError) <= mpeMass + 1e-9;
    if (!passed) {
      overallPass = false;
    }

    if (Math.abs(correctedError) > maxCorrectedError) {
      maxCorrectedError = Math.abs(correctedError);
    }
    if (mpeMass > maxMpeAllowed) {
      maxMpeAllowed = mpeMass;
    }

    return {
      index: idx + 1,
      appliedLoad,
      indicatedValue,
      deltaL: deltaL !== undefined && deltaL !== null ? Number(deltaL) : null,
      continuousIndication,
      error,
      correctedError,
      mpeInE: mpeE,
      mpeMass,
      activeE,
      currentRangeIndex: mpeInfo.currentRangeIndex,
      isIncreasing,
      passed,
    };
  });

  // Hysteresis analysis
  const incPoints = evaluatedPoints.filter(p => p.isIncreasing);
  const decPoints = evaluatedPoints.filter(p => !p.isIncreasing);
  const hysteresisAnalysis = validateHysteresis(incPoints, decPoints, instrument, isInService, ranges, tareData);

  if (!hysteresisAnalysis.overallPass) {
    overallPass = false;
  }

  const tareAnalysis = calculateTareCapacities(instrument?.maxCapacity || 0, tareData);

  return {
    points: evaluatedPoints,
    zeroError: Number(zeroError.toFixed(8)),
    maxCorrectedError: Number(maxCorrectedError.toFixed(8)),
    maxMpeAllowed: Number(maxMpeAllowed.toFixed(8)),
    hysteresisAnalysis,
    tareAnalysis,
    overallPass,
    summary: overallPass
      ? 'All measurement points and hysteresis within OIML R-76 Maximum Permissible Error tolerances.'
      : 'One or more measurement points or hysteresis exceeded Maximum Permissible Error tolerances.',
  };
}

/**
 * 2. Repeatability Test Calculation
 * Evaluates multiple consecutive weighings of identical load.
 * Difference between maximum and minimum indication must not exceed |MPE| for that load.
 * Also computes statistical parameters (mean, standard deviation s, variance) for uncertainty budget.
 * 
 * @param {Object|Array} data - Array of series or { series: [{ load, readings: [...] }] }
 * @param {Object} instrument
 * @param {boolean} [isInService=false]
 */
function calculateRepeatability(data, instrument, isInService = false) {
  let series = [];
  if (Array.isArray(data)) {
    series = data;
  } else if (data?.series && Array.isArray(data.series)) {
    series = data.series;
  } else if (data?.readings && Array.isArray(data.readings)) {
    series = [{ load: Number(data.load || instrument?.maxCapacity || 0), readings: data.readings }];
  }

  const defaultE = Number(instrument?.verificationInterval || instrument?.verificationScaleInterval_e) || 0.001;
  const accuracyClass = instrument?.accuracyClass || 'CLASS_III';
  const ranges = instrument?.ranges || instrument?.multiIntervalRanges || [{ max: Infinity, e: defaultE }];

  if (!series.length) {
    return {
      series: [],
      maxRange: 0,
      maxStdDev: 0,
      overallPass: false,
      summary: 'No repeatability test series provided.',
    };
  }

  let overallPass = true;
  let globalMaxRange = 0;
  let globalMaxStdDev = 0;

  const evaluatedSeries = series.map((s, idx) => {
    const load = Number(s.load) || 0;
    const rawReadings = Array.isArray(s.readings) ? s.readings : [];
    
    // Normalise reading values
    const numericReadings = rawReadings.map(r => (typeof r === 'object' ? Number(r.indicatedValue ?? r.reading ?? 0) : Number(r)));

    if (numericReadings.length < 2) {
      return {
        seriesIndex: idx + 1,
        load,
        readings: numericReadings,
        maxReading: numericReadings[0] || 0,
        minReading: numericReadings[0] || 0,
        mean: numericReadings[0] || 0,
        stdDev: 0,
        variance: 0,
        range: 0,
        mpeMass: 0,
        passed: false,
        remarks: 'At least 2 repeated readings required.',
      };
    }

    const n = numericReadings.length;
    const mean = numericReadings.reduce((sum, val) => sum + val, 0) / n;
    const variance = numericReadings.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / (n - 1);
    const stdDev = Math.sqrt(variance);

    const maxVal = Math.max(...numericReadings);
    const minVal = Math.min(...numericReadings);
    const range = Number((maxVal - minVal).toFixed(8));

    const mpeInfo = calculateMultiIntervalMPE(load, accuracyClass, ranges, isInService);
    const mpeMass = mpeInfo.mpe;
    const mpeE = mpeInfo.mpeInE;

    const passed = range <= mpeMass + 1e-9;
    if (!passed) {
      overallPass = false;
    }
    if (range > globalMaxRange) {
      globalMaxRange = range;
    }
    if (stdDev > globalMaxStdDev) {
      globalMaxStdDev = stdDev;
    }

    return {
      seriesIndex: idx + 1,
      load,
      readings: numericReadings,
      nReadings: n,
      maxReading: maxVal,
      minReading: minVal,
      mean: Number(mean.toFixed(8)),
      stdDev: Number(stdDev.toFixed(8)),
      variance: Number(variance.toFixed(8)),
      range,
      mpeInE: mpeE,
      mpeMass,
      activeE: mpeInfo.currentE,
      passed,
    };
  });

  return {
    series: evaluatedSeries,
    maxRange: Number(globalMaxRange.toFixed(8)),
    maxStdDev: Number(globalMaxStdDev.toFixed(8)),
    overallPass,
    summary: overallPass
      ? `Repeatability satisfied. Maximum observed variation (${globalMaxRange} ${instrument?.unit || 'kg'}) <= MPE.`
      : `Repeatability failed. Maximum variation (${globalMaxRange} ${instrument?.unit || 'kg'}) exceeded MPE limit.`,
  };
}

/**
 * 3. Eccentricity Test Calculation
 * Evaluates off-center loading across specified positions (Center, Corners/Segments).
 * Error at each position must not exceed MPE for the applied eccentricity load (typically 1/3 Max).
 * 
 * @param {Object|Array} data - { positions: [{ position, appliedLoad, indicatedValue, deltaL }] }
 * @param {Object} instrument
 * @param {boolean} [isInService=false]
 */
function calculateEccentricity(data, instrument, isInService = false) {
  const positions = Array.isArray(data) ? data : data?.positions || [];
  const defaultE = Number(instrument?.verificationInterval || instrument?.verificationScaleInterval_e) || 0.001;
  const accuracyClass = instrument?.accuracyClass || 'CLASS_III';
  const ranges = instrument?.ranges || instrument?.multiIntervalRanges || [{ max: Infinity, e: defaultE }];

  if (!positions.length) {
    return {
      positions: [],
      maxError: 0,
      mpe: 0,
      overallPass: false,
      summary: 'No eccentricity positions provided.',
    };
  }

  let overallPass = true;
  let maxError = 0;
  let mpeForTest = 0;

  // Find center position if provided as reference
  const centerPos = positions.find(p => String(p.position).toUpperCase() === 'CENTER' || String(p.position).toUpperCase() === 'POS_CENTER');
  let centerIndication = null;
  if (centerPos) {
    const { continuousIndication } = calculateIndicationAndError(centerPos.appliedLoad, centerPos.indicatedValue, defaultE, centerPos.deltaL);
    centerIndication = continuousIndication;
  }

  let maxDiffFromCenter = 0;

  const evaluatedPositions = positions.map((p, idx) => {
    const posName = p.position || `POS_${idx + 1}`;
    const appliedLoad = Number(p.appliedLoad) || 0;
    const indicatedValue = Number(p.indicatedValue) || 0;
    const deltaL = p.deltaL;

    const mpeInfo = calculateMultiIntervalMPE(appliedLoad, accuracyClass, ranges, isInService);
    const activeE = mpeInfo.currentE || defaultE;

    const { continuousIndication, error } = calculateIndicationAndError(appliedLoad, indicatedValue, activeE, deltaL);
    const absError = Math.abs(error);

    const mpeMass = mpeInfo.mpe;
    const mpeE = mpeInfo.mpeInE;
    mpeForTest = mpeMass;

    const passed = absError <= mpeMass + 1e-9;
    if (!passed) {
      overallPass = false;
    }

    if (absError > maxError) {
      maxError = absError;
    }

    let diffFromCenter = null;
    if (centerIndication !== null) {
      diffFromCenter = Number(Math.abs(continuousIndication - centerIndication).toFixed(8));
      if (diffFromCenter > maxDiffFromCenter) {
        maxDiffFromCenter = diffFromCenter;
      }
    }

    return {
      position: posName,
      appliedLoad,
      indicatedValue,
      continuousIndication,
      error,
      diffFromCenter,
      mpeInE: mpeE,
      mpeMass,
      activeE,
      passed,
    };
  });

  return {
    positions: evaluatedPositions,
    maxError: Number(maxError.toFixed(8)),
    mpe: Number(mpeForTest.toFixed(8)),
    maxDifferenceFromCenter: Number(maxDiffFromCenter.toFixed(8)),
    overallPass,
    summary: overallPass
      ? `Eccentricity test passed. Maximum error (${maxError} ${instrument?.unit || 'kg'}) within MPE limit (${mpeForTest} ${instrument?.unit || 'kg'}).`
      : `Eccentricity test failed. Maximum error (${maxError} ${instrument?.unit || 'kg'}) exceeded MPE (${mpeForTest} ${instrument?.unit || 'kg'}).`,
  };
}

/**
 * 4. Temperature Effect Test Calculation
 * Evaluates zero drift and span error over temperature range (-10°C to +40°C or declared).
 * Requirement: Zero drift <= 1e per 5°C temperature difference. Span error <= MPE.
 * 
 * @param {Object|Array} data - { temperaturePoints: [{ temperature, zeroIndication, spanLoad, spanIndication, deltaL }] }
 * @param {Object} instrument
 * @param {boolean} [isInService=false]
 */
function calculateTemperatureEffect(data, instrument, isInService = false) {
  const points = Array.isArray(data) ? data : data?.temperaturePoints || data?.tests || [];
  const defaultE = Number(instrument?.verificationInterval || instrument?.verificationScaleInterval_e) || 0.001;
  const accuracyClass = instrument?.accuracyClass || 'CLASS_III';
  const ranges = instrument?.ranges || instrument?.multiIntervalRanges || [{ max: Infinity, e: defaultE }];

  if (!points.length) {
    return {
      temperaturePoints: [],
      zeroDriftPer5C: 0,
      maxSpanError: 0,
      overallPass: false,
      summary: 'No temperature points provided.',
    };
  }

  let overallPass = true;
  let maxSpanError = 0;
  let maxDriftPer5C = 0;

  // Sort points by temperature
  const sortedPoints = [...points].sort((a, b) => Number(a.temperature) - Number(b.temperature));

  const evaluatedPoints = sortedPoints.map((p, idx) => {
    const temp = Number(p.temperature) || 0;
    const zeroInd = Number(p.zeroIndication ?? p.zeroReading ?? 0);
    const spanLoad = Number(p.spanLoad || instrument?.maxCapacity || 0);
    const spanInd = Number(p.spanIndication ?? p.spanReading ?? p.reading ?? spanLoad);

    const mpeInfo = calculateMultiIntervalMPE(spanLoad, accuracyClass, ranges, isInService);
    const activeE = mpeInfo.currentE || defaultE;

    const zeroCalc = calculateIndicationAndError(0, zeroInd, activeE, p.zeroDeltaL);
    const spanCalc = calculateIndicationAndError(spanLoad, spanInd, activeE, p.spanDeltaL);

    const spanError = spanCalc.error;
    const correctedSpanError = Number((spanError - zeroCalc.error).toFixed(8));

    const mpeMass = mpeInfo.mpe;

    const spanPassed = Math.abs(correctedSpanError) <= mpeMass + 1e-9;
    if (!spanPassed) {
      overallPass = false;
    }
    if (Math.abs(correctedSpanError) > maxSpanError) {
      maxSpanError = Math.abs(correctedSpanError);
    }

    return {
      index: idx + 1,
      temperature: temp,
      zeroIndication: zeroInd,
      zeroError: zeroCalc.error,
      spanLoad,
      spanIndication: spanInd,
      spanError,
      correctedSpanError,
      mpeMass,
      activeE,
      spanPassed,
    };
  });

  // Calculate Zero Drift per 5°C across adjacent temperatures
  const zeroDrifts = [];
  for (let i = 0; i < evaluatedPoints.length - 1; i++) {
    const p1 = evaluatedPoints[i];
    const p2 = evaluatedPoints[i + 1];
    const deltaT = Math.abs(p2.temperature - p1.temperature);
    
    if (deltaT > 0) {
      const deltaE0 = Math.abs(p2.zeroError - p1.zeroError);
      // Normalized to 5 deg C: (deltaE0 / deltaT) * 5
      const driftPer5C = Number(((deltaE0 / deltaT) * 5).toFixed(8));
      const allowedDrift = Number((1.0 * defaultE).toFixed(8)); // 1e per 5 deg C

      const driftPassed = driftPer5C <= allowedDrift + 1e-9;
      if (!driftPassed) {
        overallPass = false;
      }
      if (driftPer5C > maxDriftPer5C) {
        maxDriftPer5C = driftPer5C;
      }

      zeroDrifts.push({
        fromTemp: p1.temperature,
        toTemp: p2.temperature,
        deltaT,
        deltaE0,
        driftPer5C,
        allowedDrift,
        driftPassed,
      });
    }
  }

  return {
    temperaturePoints: evaluatedPoints,
    zeroDriftEvaluations: zeroDrifts,
    zeroDriftPer5C: Number(maxDriftPer5C.toFixed(8)),
    maxSpanError: Number(maxSpanError.toFixed(8)),
    overallPass,
    summary: overallPass
      ? `Temperature test compliant. Max zero drift (${maxDriftPer5C} / 5°C) <= 1e (${defaultE}).`
      : 'Temperature test failed. Zero drift or span error exceeded OIML R-76 limit.',
  };
}

/**
 * 5. Stability / Warm-Up Test Calculation
 * Evaluates zero and span drift over time after power-on.
 * 
 * @param {Object|Array} data - { timePoints: [{ timestampMinutes, zeroReading, loadReading, appliedLoad }] }
 * @param {Object} instrument
 * @param {boolean} [isInService=false]
 */
function calculateStability(data, instrument, isInService = false) {
  const points = Array.isArray(data) ? data : data?.timePoints || data?.points || [];
  const defaultE = Number(instrument?.verificationInterval || instrument?.verificationScaleInterval_e) || 0.001;
  const accuracyClass = instrument?.accuracyClass || 'CLASS_III';
  const ranges = instrument?.ranges || instrument?.multiIntervalRanges || [{ max: Infinity, e: defaultE }];

  if (!points.length) {
    return {
      timePoints: [],
      maxZeroDrift: 0,
      maxSpanDrift: 0,
      overallPass: false,
      summary: 'No stability time-series points provided.',
    };
  }

  let overallPass = true;
  const initialZero = Number(points[0]?.zeroReading) || 0;
  const initialLoadReading = Number(points[0]?.loadReading ?? points[0]?.reading ?? 0);
  const appliedLoad = Number(points[0]?.appliedLoad || instrument?.maxCapacity || 0);

  const mpeInfo = calculateMultiIntervalMPE(appliedLoad, accuracyClass, ranges, isInService);
  const mpeMass = mpeInfo.mpe;
  const allowedZeroDrift = Number((1.0 * defaultE).toFixed(8)); // 1.0e

  let maxZeroDrift = 0;
  let maxSpanDrift = 0;

  const evaluatedPoints = points.map((p, idx) => {
    const tMin = Number(p.timestampMinutes ?? (p.timeHrs != null ? p.timeHrs * 60 : idx * 15));
    const zeroReading = Number(p.zeroReading) || 0;
    const loadReading = Number(p.loadReading ?? p.reading ?? appliedLoad);

    const zeroDrift = Number(Math.abs(zeroReading - initialZero).toFixed(8));
    const spanDrift = Number(Math.abs(loadReading - initialLoadReading).toFixed(8));

    if (zeroDrift > maxZeroDrift) maxZeroDrift = zeroDrift;
    if (spanDrift > maxSpanDrift) maxSpanDrift = spanDrift;

    const zeroPassed = zeroDrift <= allowedZeroDrift + 1e-9;
    const spanPassed = spanDrift <= mpeMass + 1e-9;

    if (!zeroPassed || !spanPassed) {
      overallPass = false;
    }

    return {
      timestampMinutes: tMin,
      zeroReading,
      loadReading,
      zeroDrift,
      spanDrift,
      zeroPassed,
      spanPassed,
    };
  });

  return {
    timePoints: evaluatedPoints,
    maxZeroDrift: Number(maxZeroDrift.toFixed(8)),
    maxSpanDrift: Number(maxSpanDrift.toFixed(8)),
    allowedZeroDrift,
    mpeMass,
    overallPass,
    summary: overallPass
      ? `Stability test passed. Max zero drift (${maxZeroDrift}) <= 1e, span drift (${maxSpanDrift}) <= MPE.`
      : 'Stability test failed. Drift exceeded permissible limits.',
  };
}

/**
 * 6. Time-Dependence (Creep & Zero Return) Test Calculation
 * Creep under load (0, 5, 15, 30 min) and zero return after complete unloading.
 * Limits (OIML R-76 3.9.4):
 * - Delta (30m - 0m) <= 0.5 * |MPE| (or 1.0 MPE)
 * - Delta (30m - 15m) <= 0.2 * |MPE|
 * - Zero return after 30m unload <= 0.5e
 * 
 * @param {Object} data - { creepReadings: [{ minute, indication }], zeroReturn: { appliedLoad, indicationAfterUnload } }
 * @param {Object} instrument
 * @param {boolean} [isInService=false]
 */
function calculateTimeDependence(data, instrument, isInService = false) {
  const creepReadings = data?.creepReadings || data?.creep || [];
  const zeroReturn = data?.zeroReturn || { appliedLoad: 0, indicationAfterUnload: 0 };
  const defaultE = Number(instrument?.verificationInterval || instrument?.verificationScaleInterval_e) || 0.001;
  const accuracyClass = instrument?.accuracyClass || 'CLASS_III';
  const ranges = instrument?.ranges || instrument?.multiIntervalRanges || [{ max: Infinity, e: defaultE }];
  const testLoad = Number(data?.testLoad || instrument?.maxCapacity || 0);

  if (!creepReadings.length) {
    return {
      creepAnalysis: null,
      zeroReturnAnalysis: null,
      overallPass: false,
      summary: 'No creep readings provided for time-dependence test.',
    };
  }

  const mpeInfo = calculateMultiIntervalMPE(testLoad, accuracyClass, ranges, isInService);
  const mpeMass = mpeInfo.mpe;

  // Extract readings at key times
  const read0 = Number(creepReadings.find(r => Number(r.minute ?? r.min) === 0)?.indication ?? creepReadings[0]?.indication ?? creepReadings[0]?.reading ?? 0);
  const read15 = Number(creepReadings.find(r => Number(r.minute ?? r.min) === 15)?.indication ?? creepReadings[Math.floor(creepReadings.length / 2)]?.indication ?? creepReadings[Math.floor(creepReadings.length / 2)]?.reading ?? read0);
  const read30 = Number(creepReadings.find(r => Number(r.minute ?? r.min) === 30)?.indication ?? creepReadings[creepReadings.length - 1]?.indication ?? creepReadings[creepReadings.length - 1]?.reading ?? read0);

  const delta30to0 = Number(Math.abs(read30 - read0).toFixed(8));
  const delta30to15 = Number(Math.abs(read30 - read15).toFixed(8));

  const allowedDelta30 = Number((0.5 * mpeMass).toFixed(8)); // 0.5 MPE
  const allowedDelta15to30 = Number((0.2 * mpeMass).toFixed(8)); // 0.2 MPE

  const creep30Passed = delta30to0 <= allowedDelta30 + 1e-9;
  const creep15Passed = delta30to15 <= allowedDelta15to30 + 1e-9;

  // Zero return analysis
  const zeroIndicationAfter = Number(zeroReturn.indicationAfterUnload ?? zeroReturn.readingAfterUnload ?? 0);
  const zeroReturnError = Number(Math.abs(zeroIndicationAfter).toFixed(8));
  const allowedZeroReturn = Number((0.5 * defaultE).toFixed(8)); // 0.5e

  const zeroReturnPassed = zeroReturnError <= allowedZeroReturn + 1e-9;

  const overallPass = creep30Passed && creep15Passed && zeroReturnPassed;

  return {
    creepAnalysis: {
      reading0m: read0,
      reading15m: read15,
      reading30m: read30,
      delta30to0,
      allowedDelta30,
      creep30Passed,
      delta30to15,
      allowedDelta15to30,
      creep15Passed,
      mpeMass,
    },
    zeroReturnAnalysis: {
      zeroIndicationAfter,
      zeroReturnError,
      allowedZeroReturn,
      zeroReturnPassed,
    },
    overallPass,
    summary: overallPass
      ? 'Time dependence test compliant. Creep and zero return errors within OIML R-76 limits.'
      : 'Time dependence test failed. Creep or zero return exceeded permissible thresholds.',
  };
}

/**
 * Dispatcher to evaluate any test result based on testType
 * 
 * @param {string} testType - 'WEIGHING_PERFORMANCE' | 'REPEATABILITY' | 'ECCENTRICITY' | 'TEMPERATURE' | 'STABILITY' | 'TIME_DEPENDENCE'
 * @param {Object} data - Raw test data
 * @param {Object} instrument - Instrument metadata
 * @param {boolean} [isInService=false]
 * @returns {Object} { testType, status: 'COMPLETED', result: 'PASS'|'FAIL', calculations, data }
 */
function evaluateTestResult(testType, data, instrument, isInService = false) {
  let calculations = {};

  switch (testType) {
    case 'WEIGHING_PERFORMANCE':
    case 'WEIGHING':
      calculations = calculateWeighingPerformance(data, instrument, isInService);
      break;
    case 'REPEATABILITY':
      calculations = calculateRepeatability(data, instrument, isInService);
      break;
    case 'ECCENTRICITY':
      calculations = calculateEccentricity(data, instrument, isInService);
      break;
    case 'TEMPERATURE':
    case 'TEMPERATURE_EFFECTS':
      calculations = calculateTemperatureEffect(data, instrument, isInService);
      break;
    case 'STABILITY':
      calculations = calculateStability(data, instrument, isInService);
      break;
    case 'TIME_DEPENDENCE':
      calculations = calculateTimeDependence(data, instrument, isInService);
      break;
    default:
      throw new Error(`Unsupported test type: ${testType}`);
  }

  const result = calculations.overallPass ? 'PASS' : 'FAIL';

  return {
    testType,
    status: 'COMPLETED',
    result,
    calculations,
    data,
  };
}

module.exports = {
  MPE_TABLE,
  MIN_CAPACITY_IN_E,
  normalizeRanges,
  getMPE,
  calculateTareCapacities,
  calculateMultiIntervalMPE,
  getTareAdjustedMPE,
  generateBoundaryLoadPoints,
  validateHysteresis,
  calculateIndicationAndError,
  calculateWeighingPerformance,
  calculateRepeatability,
  calculateEccentricity,
  calculateTemperatureEffect,
  calculateStability,
  calculateTimeDependence,
  evaluateTestResult,
};
