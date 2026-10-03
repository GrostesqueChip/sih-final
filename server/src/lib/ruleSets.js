/**
 * Versioned OIML rule sets.
 *
 * Every limit the calculation engine applies (the Table 6 MPE steps, the
 * in-service factor, creep / zero-return / zero-drift limits, minimum capacity)
 * lives in a named edition here, not in the engine's code. When OIML revises
 * R 76, a new edition is added beside the existing one and selected with the
 * OIML_RULE_SET environment variable (or setActiveRuleSet); reports state the
 * edition they were evaluated against, and results computed under an earlier
 * edition stay reproducible because that edition is still present.
 *
 * All loads and limits are in units of the verification scale interval e.
 */

const R76_2006 = {
  id: 'OIML-R76-2006',
  title: 'OIML R 76-1:2006 / R 76-2:2007',
  standard: 'OIML R 76',
  edition: '2006',
  effectiveFrom: '2006-01-01',
  source: 'https://www.oiml.org/en/files/pdf_r/r076-1-e06.pdf',
  // R 76-1 Table 6: maximum permissible errors on initial verification
  mpeTable: {
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
  },
  // R 76-1 Table 3: minimum capacity in e
  minCapacityInE: { CLASS_I: 100, CLASS_II: 50, CLASS_III: 20, CLASS_IIII: 10 },
  // R 76-1 3.5.2: in-service MPE = 2 x initial-verification MPE
  inServiceFactor: 2,
  limits: {
    creep30MinE: 0.5, // A.4.11.1: |I30 - I0| <= 0.5 e
    creep15To30MinE: 0.2, // A.4.11.1: |I30 - I15| <= 0.2 e
    zeroReturnE: 0.5, // A.4.11.2: zero return after unloading <= 0.5 e
    zeroDriftE: 1.0, // A.5.3.2: zero change <= 1 e per basis interval
    zeroDriftBasisC: { CLASS_I: 1, DEFAULT: 5 }, // per 1 degree C for class I, per 5 degrees C otherwise
  },
};

const CLASSES = ['CLASS_I', 'CLASS_II', 'CLASS_III', 'CLASS_IIII'];
const DEFAULT_ID = R76_2006.id;
// One registry per process, even if this file is loaded through more than one module system
// (the server uses require; the test runner may import it as an ES module).
const state = (globalThis.__nawiRuleSets ||= { registry: new Map([[R76_2006.id, R76_2006]]), activeId: null });
const registry = state.registry;
if (!state.activeId) state.activeId = registry.has(process.env.OIML_RULE_SET) ? process.env.OIML_RULE_SET : DEFAULT_ID;

const isNum = (v) => typeof v === 'number' && !Number.isNaN(v);

/** Throws with a precise message if a rule set is malformed. A bad edition must never reach the engine. */
function validateRuleSet(rs) {
  if (!rs || typeof rs !== 'object') throw new Error('Rule set must be an object');
  for (const k of ['id', 'title', 'edition', 'effectiveFrom']) {
    if (typeof rs[k] !== 'string' || !rs[k].trim()) throw new Error(`Rule set is missing "${k}"`);
  }
  for (const cls of CLASSES) {
    const tiers = rs.mpeTable?.[cls];
    if (!Array.isArray(tiers) || tiers.length === 0) throw new Error(`Rule set ${rs.id}: no MPE steps for ${cls}`);
    let prevMax = 0;
    for (const t of tiers) {
      if (!isNum(t.minLoad) || !isNum(t.maxLoad) || !isNum(t.mpeInitial) || t.mpeInitial <= 0) throw new Error(`Rule set ${rs.id}: bad MPE step in ${cls}`);
      if (t.minLoad !== prevMax || t.maxLoad <= t.minLoad) throw new Error(`Rule set ${rs.id}: MPE steps for ${cls} must be contiguous from 0`);
      prevMax = t.maxLoad;
    }
    if (!isNum(rs.minCapacityInE?.[cls]) || rs.minCapacityInE[cls] <= 0) throw new Error(`Rule set ${rs.id}: no minimum capacity for ${cls}`);
  }
  if (!isNum(rs.inServiceFactor) || rs.inServiceFactor < 1) throw new Error(`Rule set ${rs.id}: inServiceFactor must be >= 1`);
  const L = rs.limits || {};
  for (const k of ['creep30MinE', 'creep15To30MinE', 'zeroReturnE', 'zeroDriftE']) {
    if (!isNum(L[k]) || L[k] <= 0) throw new Error(`Rule set ${rs.id}: limit "${k}" must be a positive number`);
  }
  if (!isNum(L.zeroDriftBasisC?.DEFAULT) || L.zeroDriftBasisC.DEFAULT <= 0) throw new Error(`Rule set ${rs.id}: zeroDriftBasisC.DEFAULT is required`);
  return true;
}

/** Add an edition (for example a future revision of R 76). It does not become active by itself. */
function registerRuleSet(rs) {
  validateRuleSet(rs);
  if (registry.has(rs.id)) throw new Error(`Rule set ${rs.id} is already registered`);
  registry.set(rs.id, rs);
  return rs;
}

function getRuleSet(id) {
  return registry.get(id) || null;
}

function getActiveRuleSet() {
  return registry.get(state.activeId);
}

function setActiveRuleSet(id) {
  if (!registry.has(id)) throw new Error(`Unknown rule set: ${id}`);
  state.activeId = id;
  return registry.get(id);
}

/** Editions without their tables, for listing in the API and on reports. */
function listRuleSets() {
  return [...registry.values()].map((r) => ({ id: r.id, title: r.title, standard: r.standard, edition: r.edition, effectiveFrom: r.effectiveFrom, source: r.source || null, active: r.id === state.activeId }));
}

/** Zero-drift basis interval in degrees C for an accuracy class under the active edition. */
function zeroDriftBasisFor(accuracyClass, rs = getActiveRuleSet()) {
  const b = rs.limits.zeroDriftBasisC;
  return b[String(accuracyClass || '').toUpperCase()] ?? b.DEFAULT;
}

module.exports = {
  DEFAULT_RULE_SET_ID: DEFAULT_ID,
  registerRuleSet,
  validateRuleSet,
  getRuleSet,
  getActiveRuleSet,
  setActiveRuleSet,
  listRuleSets,
  zeroDriftBasisFor,
};
