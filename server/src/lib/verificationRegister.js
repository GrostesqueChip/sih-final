/**
 * Rules shared by every path that opens or seals a verification session
 * (the online finalize endpoint and the offline batch sync), so both issue
 * certificates from the same register under the same completion rule.
 */
const prisma = require('./prisma');

const {
  ALL_REQUIRED_TEST_TYPES,
  VERIFICATION_TEST_TYPES,
  TYPE_EVALUATION_TEST_TYPES,
  SESSION_TYPES,
  isTypeEvaluation,
  requiredTestTypesFor,
  isInServiceSession,
} = require('./sessionTypes');

/**
 * Next certificate number in the statutory register: NAWI-YYYY-NNNNNN.
 * Sequential within the calendar year so the register reads without gaps.
 */
async function generateCertificateNumber(sessionType) {
  const year = new Date().getFullYear();
  // Type evaluation test reports have their own register (TER-YYYY-NNNNNN).
  const prefix = `${isTypeEvaluation(sessionType) ? 'TER' : 'NAWI'}-${year}-`;
  let next = 101;
  try {
    const existing = await prisma.testSession.findMany({
      where: { certificateNo: { startsWith: prefix } },
      select: { certificateNo: true },
    });
    for (const row of existing) {
      const n = Number(String(row.certificateNo).slice(prefix.length));
      if (Number.isFinite(n) && n >= next) next = n + 1;
    }
  } catch (e) {
    next = 100000 + (Date.now() % 100000);
  }
  let candidate = `${prefix}${String(next).padStart(6, '0')}`;
  // Guard against a concurrent writer having taken the same number.
  while (await prisma.testSession.findUnique({ where: { certificateNo: candidate } }).catch(() => null)) {
    next += 1;
    candidate = `${prefix}${String(next).padStart(6, '0')}`;
  }
  return candidate;
}

module.exports = {
  ALL_REQUIRED_TEST_TYPES,
  VERIFICATION_TEST_TYPES,
  TYPE_EVALUATION_TEST_TYPES,
  SESSION_TYPES,
  isTypeEvaluation,
  requiredTestTypesFor,
  isInServiceSession,
  generateCertificateNumber,
};
