/**
 * Pure rules for session (report) types — no database access, so they can be
 * shared by the routes, the offline sync, the seal builder and the demo seed.
 */

/** Every test module the engine can evaluate. */
const ALL_REQUIRED_TEST_TYPES = [
  'WEIGHING_PERFORMANCE',
  'REPEATABILITY',
  'ECCENTRICITY',
  'TEMPERATURE',
  'STABILITY',
  'TIME_DEPENDENCE',
];

/**
 * Verification (initial, periodic, in-service inspection) uses only the tests an
 * officer can perform on an installed instrument. Temperature, warm-up time and
 * creep are type-evaluation tests (OIML R 76-1 A.5 / A.4.11) carried out by a
 * designated laboratory for model approval, so they belong to a Type
 * Evaluation Test Report, not to a verification certificate.
 */
const VERIFICATION_TEST_TYPES = ['WEIGHING_PERFORMANCE', 'REPEATABILITY', 'ECCENTRICITY'];
const TYPE_EVALUATION_TEST_TYPES = [...ALL_REQUIRED_TEST_TYPES];

const SESSION_TYPES = ['INITIAL', 'PERIODIC', 'INSPECTION', 'TYPE_EVALUATION'];

function isTypeEvaluation(sessionOrType) {
  const t = typeof sessionOrType === 'string' ? sessionOrType : sessionOrType?.verificationType;
  return t === 'TYPE_EVALUATION';
}

/** Test modules required to finalise a session of the given type. */
function requiredTestTypesFor(sessionOrType) {
  return isTypeEvaluation(sessionOrType) ? TYPE_EVALUATION_TEST_TYPES : VERIFICATION_TEST_TYPES;
}

/**
 * In-service MPE (2x, OIML R 76-1 3.5.2) applies only to in-service
 * inspection. It is derived from the session type on the server — never taken
 * from the client — so an officer cannot choose the looser limit.
 */
function isInServiceSession(sessionOrType) {
  const t = typeof sessionOrType === 'string' ? sessionOrType : sessionOrType?.verificationType;
  return t === 'INSPECTION';
}

module.exports = {
  ALL_REQUIRED_TEST_TYPES,
  VERIFICATION_TEST_TYPES,
  TYPE_EVALUATION_TEST_TYPES,
  SESSION_TYPES,
  isTypeEvaluation,
  requiredTestTypesFor,
  isInServiceSession,
};
