import React from 'react';
import { useTranslation } from 'react-i18next';
import { FiCheckCircle, FiXCircle, FiClock, FiAlertTriangle, FiLoader, FiMinusCircle } from 'react-icons/fi';

const TONES = {
  green: 'bg-green-50 text-green-800 border-green-300',
  red: 'bg-red-50 text-red-700 border-red-300',
  amber: 'bg-amber-50 text-amber-800 border-amber-300',
  blue: 'bg-primary-50 text-primary-800 border-primary-200',
  slate: 'bg-slate-100 text-slate-700 border-slate-300',
  navy: 'bg-navy text-white border-navy',
};

const MAP = {
  PASS: ['green', 'common.pass', 'Pass', FiCheckCircle],
  PASSED: ['green', 'common.pass', 'Pass', FiCheckCircle],
  FAIL: ['red', 'common.fail', 'Fail', FiXCircle],
  FAILED: ['red', 'common.fail', 'Fail', FiXCircle],
  COMPLETED: ['green', 'status.completed', 'Sealed', FiCheckCircle],
  IN_PROGRESS: ['blue', 'status.inProgress', 'In Progress', FiLoader],
  PENDING: ['amber', 'status.pending', 'Pending', FiClock],
  ACTIVE: ['green', 'common.active', 'Active', FiCheckCircle],
  INACTIVE: ['slate', 'common.inactive', 'Inactive', FiMinusCircle],
  VALID: ['green', 'compliance.VALID', 'Valid', FiCheckCircle],
  DUE_SOON: ['amber', 'compliance.DUE_SOON', 'Due Soon', FiClock],
  EXPIRED: ['red', 'compliance.EXPIRED', 'Expired', FiAlertTriangle],
  REJECTED: ['red', 'compliance.REJECTED', 'Rejected', FiXCircle],
  NOT_VERIFIED: ['slate', 'compliance.NOT_VERIFIED', 'Not Verified', FiMinusCircle],
  NOT_STARTED: ['slate', 'status.notStarted', 'Not Started', FiMinusCircle],
  ADMIN: ['navy', 'roles.ADMIN', 'Controller', null],
  INSPECTOR: ['blue', 'roles.INSPECTOR', 'Inspector', null],
  VIEWER: ['slate', 'roles.VIEWER', 'Auditor', null],
};

export default function StatusBadge({ status, customLabel, size = 'sm', icon = true }) {
  const { t } = useTranslation();
  if (!status && !customLabel) return null;
  const key = String(status || '').toUpperCase().trim();
  const [tone, tKey, fallback, Icon] = MAP[key] || ['slate', null, status, null];
  const label = customLabel || (tKey ? t(tKey, fallback) : fallback);
  const sizing = size === 'xs' ? 'h-5 px-1.5 text-[10.5px] gap-1' : size === 'md' ? 'h-7 px-3 text-xs gap-1.5' : 'h-6 px-2 text-[11px] gap-1';
  return (
    <span className={`inline-flex items-center justify-center whitespace-nowrap font-bold border rounded-full uppercase tracking-wide ${sizing} ${TONES[tone]}`}>
      {icon && Icon && <Icon className={size === 'md' ? 'w-3.5 h-3.5' : 'w-3 h-3'} aria-hidden="true" />}
      {label}
    </span>
  );
}
