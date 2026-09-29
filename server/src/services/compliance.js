/**
 * Stamping / verification status of an instrument, derived from its most
 * recent finalized session. Under the Legal Metrology (General) Rules, 2011
 * a weighing instrument must be re-verified every 12 months.
 */
const VALIDITY_MONTHS = 12;
const DUE_SOON_DAYS = 45;
const DAY = 86400000;

function addMonths(date, months) {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

function latestFinalized(sessions = []) {
  return sessions
    .filter((s) => (s.status === 'COMPLETED' || s.status === 'FAILED') && (s.completedAt || s.sealedAt))
    .sort((a, b) => new Date(b.completedAt || b.sealedAt) - new Date(a.completedAt || a.sealedAt))[0];
}

/**
 * @returns {{ status: 'VALID'|'DUE_SOON'|'EXPIRED'|'REJECTED'|'NOT_VERIFIED',
 *             lastVerifiedAt, validUntil, daysRemaining, lastCertificateNo, lastSessionId }}
 */
function complianceFor(sessions = [], now = Date.now()) {
  const last = latestFinalized(sessions);
  const inProgress = sessions.some((s) => s.status === 'IN_PROGRESS' || s.status === 'PENDING');
  if (!last) {
    return { status: 'NOT_VERIFIED', lastVerifiedAt: null, validUntil: null, daysRemaining: null, lastCertificateNo: null, lastSessionId: null, inProgress };
  }
  const verifiedAt = new Date(last.completedAt || last.sealedAt);
  const base = { lastVerifiedAt: verifiedAt, lastCertificateNo: last.certificateNo, lastSessionId: last.id, inProgress };
  if (last.overallResult !== 'PASS') {
    return { ...base, status: 'REJECTED', validUntil: null, daysRemaining: null };
  }
  const validUntil = addMonths(verifiedAt, VALIDITY_MONTHS);
  const daysRemaining = Math.ceil((validUntil.getTime() - now) / DAY);
  let status = 'VALID';
  if (daysRemaining < 0) status = 'EXPIRED';
  else if (daysRemaining <= DUE_SOON_DAYS) status = 'DUE_SOON';
  return { ...base, status, validUntil, daysRemaining };
}

module.exports = { complianceFor, addMonths, VALIDITY_MONTHS, DUE_SOON_DAYS };
