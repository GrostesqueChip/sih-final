/**
 * Display formatting shared by every screen: Indian date conventions
 * (DD Mon YYYY, IST), Indian digit grouping and human labels for enums.
 */
import i18n from '../i18n/i18n';

const locale = () => (i18n.language === 'hi' ? 'hi-IN' : 'en-IN');

export function formatDate(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(locale(), { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });
}

export function formatDateTime(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString(locale(), {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
    timeZone: 'Asia/Kolkata',
  });
}

export function formatTime(value) {
  if (!value) return '—';
  const d = new Date(value);
  return d.toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' });
}

export function relativeDays(value) {
  if (!value) return '';
  const days = Math.round((new Date(value).getTime() - Date.now()) / 86400000);
  const rtf = new Intl.RelativeTimeFormat(locale(), { numeric: 'auto' });
  if (Math.abs(days) < 1) return rtf.format(0, 'day');
  if (Math.abs(days) < 45) return rtf.format(days, 'day');
  return rtf.format(Math.round(days / 30), 'month');
}

export function decimalsFor(step) {
  const s = String(step ?? '');
  if (s.includes('e-')) return Number(s.split('e-')[1]);
  return s.includes('.') ? s.split('.')[1].length : 0;
}

/** Format a mass value at the instrument's display resolution. */
export function formatMass(value, instrument, { signed = false, extra = 0 } = {}) {
  if (value === null || value === undefined || value === '' || Number.isNaN(Number(value))) return '—';
  const d = Number(instrument?.actualInterval || instrument?.actualScaleInterval_d || instrument?.verificationInterval || 0.01);
  const dp = Math.min(6, decimalsFor(d) + extra);
  const n = Number(value);
  const s = n.toLocaleString('en-IN', { minimumFractionDigits: dp, maximumFractionDigits: dp });
  return signed && n > 0 ? `+${s}` : s;
}

/**
 * Format a limit (MPE, creep or drift limit). Limits are fractions of e, such as
 * 1.5 e = 0.015 kg on a 10 g scale, so they get the extra decimals they need
 * (up to three) instead of being rounded to the display resolution.
 */
export function formatLimit(value, instrument) {
  if (value === null || value === undefined || value === '' || Number.isNaN(Number(value))) return '—';
  const n = Number(value);
  let extra = 0;
  while (extra < 3 && Math.abs(Number(formatMass(n, instrument, { extra }).replace(/,/g, '')) - n) > 1e-9) extra += 1;
  return formatMass(n, instrument, { extra });
}

export function formatNumber(value, opts = {}) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '—';
  return Number(value).toLocaleString('en-IN', opts);
}

export function formatINR(value) {
  if (value === null || value === undefined) return '—';
  return `₹ ${Number(value).toLocaleString('en-IN')}`;
}

export function initials(name = '') {
  const parts = String(name)
    .replace(/^(Shri|Smt\.?|Sri|Dr\.?|Kumari|Ms\.?|Mr\.?)\s+/i, '')
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return '?';
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

export const CLASS_LABELS = {
  CLASS_I: 'Class I',
  CLASS_II: 'Class II',
  CLASS_III: 'Class III',
  CLASS_IIII: 'Class IIII',
};

export const CLASS_DESC = {
  CLASS_I: 'Special accuracy',
  CLASS_II: 'High accuracy',
  CLASS_III: 'Medium accuracy',
  CLASS_IIII: 'Ordinary accuracy',
};

export function classLabel(c) {
  return CLASS_LABELS[c] || c || '—';
}

export const TYPE_LABELS = {
  WEIGHBRIDGE: 'Weighbridge',
  PLATFORM_SCALE: 'Platform Scale',
  ELECTRONIC_SCALE: 'Electronic Scale',
  LABORATORY_BALANCE: 'Laboratory Balance',
};

export function typeLabel(t) {
  return i18n.t(`instrumentType.${t}`, TYPE_LABELS[t] || t || '—');
}

export const TYPE_PHOTOS = {
  WEIGHBRIDGE: '/assets/photos/weighbridge.jpg',
  PLATFORM_SCALE: '/assets/photos/bench-scale.jpg',
  ELECTRONIC_SCALE: '/assets/photos/counter-scale.jpg',
  LABORATORY_BALANCE: '/assets/photos/lab-balance.jpg',
};

export function instrumentPhoto(inst) {
  return inst?.photo || TYPE_PHOTOS[inst?.type] || '/assets/photos/bench-scale.jpg';
}

export const VERIFICATION_TYPES = {
  INITIAL: 'Initial Verification',
  PERIODIC: 'Periodic Re-verification',
  INSPECTION: 'In-service Inspection',
};

export function verificationTypeLabel(v) {
  return i18n.t(`verificationType.${v}`, VERIFICATION_TYPES[v] || v || '—');
}

export const TEST_MODULES = [
  { type: 'WEIGHING_PERFORMANCE', key: 'weighing', title: 'Weighing Performance', clause: 'R 76-1 A.4.4', short: 'Weighing' },
  { type: 'REPEATABILITY', key: 'repeatability', title: 'Repeatability', clause: 'R 76-1 A.4.10', short: 'Repeatability' },
  { type: 'ECCENTRICITY', key: 'eccentricity', title: 'Eccentricity (Off-centre)', clause: 'R 76-1 A.4.7', short: 'Eccentricity' },
  { type: 'TEMPERATURE', key: 'temperature', title: 'Temperature Effect', clause: 'R 76-1 A.5.3', short: 'Temperature' },
  { type: 'STABILITY', key: 'stability', title: 'Stability & Warm-up', clause: 'R 76-1 A.4.11', short: 'Stability' },
  { type: 'TIME_DEPENDENCE', key: 'timeDependence', title: 'Time Dependence (Creep)', clause: 'R 76-1 A.4.8', short: 'Creep' },
];

export function moduleTitle(type) {
  const m = TEST_MODULES.find((x) => x.type === type);
  return m ? i18n.t(`modules.${m.key}`, m.title) : type;
}

export const COMPLIANCE = {
  VALID: { label: 'Valid', tone: 'green' },
  DUE_SOON: { label: 'Due for Re-verification', tone: 'amber' },
  EXPIRED: { label: 'Verification Expired', tone: 'red' },
  REJECTED: { label: 'Rejected', tone: 'red' },
  NOT_VERIFIED: { label: 'Not yet Verified', tone: 'slate' },
};

export function complianceLabel(s) {
  return i18n.t(`compliance.${s}`, COMPLIANCE[s]?.label || s);
}

export const ROLE_LABELS = {
  ADMIN: 'Controller (Admin)',
  INSPECTOR: 'Inspector',
  VIEWER: 'Auditor (Read-only)',
};
