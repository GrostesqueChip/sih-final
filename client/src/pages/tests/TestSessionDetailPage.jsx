import React, { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  FiCheckCircle,
  FiXCircle,
  FiFileText,
  FiLock,
  FiArrowRight,
  FiEdit3,
  FiEye,
  FiThermometer,
  FiDroplet,
  FiWind,
  FiUser,
  FiCalendar,
  FiAlertTriangle,
  FiX,
  FiShield,
} from 'react-icons/fi';

import apiClient from '../../hooks/useApi';
import StatusBadge from '../../components/shared/StatusBadge';
import LoadingSpinner from '../../components/shared/LoadingSpinner';
import { useAuth } from '../../contexts/AuthContext';
import { TricolorBar } from '../../components/common/StateEmblem';
import {
  modulesFor,
  moduleTitle,
  classLabel,
  typeLabel,
  formatDate,
  formatDateTime,
  formatMass,
  formatLimit,
  instrumentPhoto,
  verificationTypeLabel,
} from '../../utils/format';

const MODULE_DESC = {
  WEIGHING_PERFORMANCE: 'Increasing & decreasing loads from zero to Max; every error (Ec) within the stepped MPE. Hysteresis shown for information.',
  REPEATABILITY: 'Repeated loadings at about 50 % and 100 % of Max; spread must not exceed the MPE.',
  ECCENTRICITY: 'About ⅓ Max placed at the centre and four corners of the load receptor.',
  TEMPERATURE: 'Zero and span at 20, 40, −10 and 5 °C; zero change ≤ 1e per 1 °C (class I) or per 5 °C (other classes).',
  STABILITY: 'Warm-up time: zero (E0) and load (EL) at 0, 5, 15 and 30 min after switch-on; |EL − E0| ≤ MPE.',
  TIME_DEPENDENCE: 'Creep under Max: ≤ 0.5e over 30 min and ≤ 0.2e between 15 and 30 min; zero return ≤ 0.5e.',
};

export function finding(type, calc, inst) {
  if (!calc) return null;
  const f = (v) => formatMass(v, inst);
  const fl = (v) => formatLimit(v, inst);
  const u = inst?.unit || '';
  switch (type) {
    case 'WEIGHING_PERFORMANCE':
      return `Max |Ec| ${f(calc.maxCorrectedError)} ${u} · MPE ${fl(calc.maxMpeAllowed)} ${u}`;
    case 'REPEATABILITY': {
      const w = (calc.series || []).reduce((a, s) => (s.range > (a?.range ?? -1) ? s : a), null);
      return w ? `Max spread ${f(w.range)} ${u} · MPE ${fl(w.mpeMass)} ${u}` : null;
    }
    case 'ECCENTRICITY':
      return `Max error ${f(calc.maxError)} ${u} · MPE ${fl(calc.mpe)} ${u}`;
    case 'TEMPERATURE':
      return `Zero change ${f(calc.maxZeroDriftPerBasis ?? calc.zeroDriftPer5C)} ${u}/${calc.zeroBasisC || 5} °C · span error ${f(calc.maxSpanError)} ${u}`;
    case 'STABILITY':
      return calc.maxCorrectedLoadError != null
        ? `Max |EL − E0| ${f(calc.maxCorrectedLoadError)} ${u} · MPE ${fl(calc.mpeMass)} ${u}`
        : `Span drift ${f(calc.maxSpanDrift)} ${u} · limit ${fl(calc.mpeMass)} ${u}`;
    case 'TIME_DEPENDENCE':
      return `Creep 15–30 min ${f(calc.creepAnalysis?.delta30to15)} ${u} (≤ ${fl(calc.creepAnalysis?.allowedDelta15to30)}) · zero return ${f(calc.zeroReturnAnalysis?.zeroReturnError)} ${u}`;
    default:
      return null;
  }
}

export default function TestSessionDetailPage() {
  const { t } = useTranslation();
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { isInspector, user } = useAuth();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [finalRemarks, setFinalRemarks] = useState('');

  const { data: s, isLoading, isError } = useQuery({
    queryKey: ['test-session', id],
    queryFn: async () => (await apiClient.get(`/tests/${id}`)).data?.data,
  });

  const finalize = useMutation({
    mutationFn: async () => (await apiClient.post(`/tests/${id}/finalize`, { remarks: finalRemarks })).data,
    onSuccess: (res) => {
      queryClient.invalidateQueries();
      const v = res?.data?.overallResult;
      const te = res?.data?.verificationType === 'TYPE_EVALUATION';
      toast.success(
        te
          ? t('detail.sealedTE', 'Sealed — type evaluation test report issued.')
          : v === 'PASS'
            ? t('detail.sealedPass', 'Sealed — instrument APPROVED. Certificate issued.')
            : t('detail.sealedFail', 'Sealed — instrument REJECTED. Rejection certificate issued.'),
        { duration: 5000 }
      );
      setConfirmOpen(false);
      navigate(`/reports/${id}`);
    },
    onError: (err) => {
      toast.error(err.response?.data?.message || t('detail.finalizeFail', 'Could not finalise the session'));
    },
  });

  if (isLoading) return <LoadingSpinner message={t('common.loading', 'Loading…')} />;
  if (isError || !s) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-10 text-center">
        <h2 className="text-lg font-bold">{t('detail.notFound', 'Session not found')}</h2>
        <button type="button" onClick={() => navigate('/tests')} className="mt-4 h-10 px-4 rounded-md bg-navy text-white text-sm font-bold">{t('detail.back', 'Back to sessions')}</button>
      </div>
    );
  }

  const inst = s.instrument || {};
  const sealed = s.status === 'COMPLETED' || s.status === 'FAILED';
  const byType = Object.fromEntries((s.testResults || []).map((r) => [r.testType, r]));
  const MODULES = modulesFor(s.verificationType);
  const isTE = s.verificationType === 'TYPE_EVALUATION';
  const total = MODULES.length;
  const doneCount = MODULES.filter((m) => byType[m.type]?.status === 'COMPLETED').length;
  const predicted = MODULES.every((m) => byType[m.type]?.result === 'PASS') ? 'PASS' : 'FAIL';
  const canEdit = isInspector && !sealed && (user?.role === 'ADMIN' || s.conductedById === user?.id);
  const failing = MODULES.filter((m) => byType[m.type]?.result === 'FAIL');

  const openFinalize = () => {
    setFinalRemarks(
      isTE
        ? predicted === 'PASS'
          ? `Type evaluation of the test sample completed. All ${total} recorded OIML R 76 test modules meet the ${classLabel(inst.accuracyClass)} limits; remaining R 76-2 tests are listed in the report as not covered.`
          : `${failing.map((m) => moduleTitle(m.type)).join(', ')} failed the OIML R 76 limits. Applicant to be informed before re-submission of the model.`
        : predicted === 'PASS'
          ? `${verificationTypeLabel(s.verificationType)} completed. Weighing, repeatability and eccentricity tests conform to ${classLabel(inst.accuracyClass)} limits. Instrument stamped and approved for use in trade.`
          : `REJECTED — ${failing.map((m) => moduleTitle(m.type)).join(', ')} outside the maximum permissible error. Instrument sealed against commercial use pending repair and re-verification.`
    );
    setConfirmOpen(true);
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-saffron-700">{verificationTypeLabel(s.verificationType)}</div>
          <h1 className="text-2xl font-extrabold text-navy flex flex-wrap items-center gap-3">
            <span className="font-mono">{s.certificateNo}</span>
            <StatusBadge status={sealed ? s.overallResult : 'IN_PROGRESS'} size="md" />
          </h1>
          <p className="text-sm text-slate-600 mt-1">{inst.name} · <span className="font-mono">S/N {inst.serialNumber}</span></p>
        </div>
        <div className="flex flex-wrap gap-2">
          {sealed ? (
            <button type="button" onClick={() => navigate(`/reports/${s.id}`)} className="inline-flex items-center gap-2 h-10 px-4 rounded-md bg-navy text-white text-sm font-bold hover:bg-navy-light">
              <FiFileText className="w-4 h-4" /> {t('detail.viewCert', 'View certificate & reports')}
            </button>
          ) : (
            canEdit && (
              <button
                type="button"
                disabled={doneCount < total}
                onClick={openFinalize}
                title={doneCount < total ? t('detail.finishFirstN', 'Complete all {{n}} modules first', { n: total }) : ''}
                className="inline-flex items-center gap-2 h-10 px-4 rounded-md bg-green-700 hover:bg-green-800 text-white text-sm font-bold disabled:bg-slate-300 disabled:text-slate-600 disabled:cursor-not-allowed"
              >
                <FiLock className="w-4 h-4" /> {t('detail.finalize', 'Finalise & seal')} {doneCount < total && `(${doneCount}/${total})`}
              </button>
            )
          )}
        </div>
      </div>

      {!sealed && !canEdit && (
        <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-600 flex gap-2">
          <FiEye className="w-4 h-4 shrink-0" />
          {t('detail.readOnly', 'Read-only: only the officer who opened this session (or the Controller) can record readings.')}
        </div>
      )}

      {/* Info */}
      <div className="grid gap-5 lg:grid-cols-[1.1fr_1fr]">
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden flex">
          <img src={instrumentPhoto(inst)} alt="" className="w-36 sm:w-44 object-cover hidden sm:block" />
          <div className="p-5 min-w-0 flex-1">
            <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{t('detail.instrument', 'Instrument under test')}</div>
            <button type="button" onClick={() => navigate(`/instruments/${inst.id}`)} className="text-left text-base font-bold text-navy hover:underline mt-0.5">{inst.name}</button>
            <div className="text-xs text-slate-500">{typeLabel(inst.type)} · {inst.manufacturer} {inst.model}</div>
            <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
              <div className="p-2 rounded bg-slate-50"><div className="text-slate-500">{t('table.classShort', 'Class')}</div><div className="font-bold">{classLabel(inst.accuracyClass)}</div></div>
              <div className="p-2 rounded bg-slate-50"><div className="text-slate-500">Max</div><div className="font-bold">{formatMass(inst.maxCapacity, inst)} {inst.unit}</div></div>
              <div className="p-2 rounded bg-slate-50"><div className="text-slate-500">e / d</div><div className="font-bold">{inst.verificationInterval} / {inst.actualInterval}</div></div>
            </div>
            <div className="mt-2 text-xs text-slate-500 truncate">{inst.ownerName} · {inst.location}</div>
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-3">{t('detail.conditions', 'Session record')}</div>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5 text-[13px]">
            <div className="flex items-center gap-2"><FiUser className="w-4 h-4 text-slate-400" /><span className="text-slate-800">{s.conductedBy?.name}</span></div>
            <div className="flex items-center gap-2"><FiCalendar className="w-4 h-4 text-slate-400" /><span>{formatDateTime(s.startedAt)}</span></div>
            <div className="flex items-center gap-2"><FiThermometer className="w-4 h-4 text-slate-400" /><span>{s.temperature ?? '—'} °C</span></div>
            <div className="flex items-center gap-2"><FiDroplet className="w-4 h-4 text-slate-400" /><span>{s.humidity ?? '—'} % RH</span></div>
            <div className="flex items-center gap-2"><FiWind className="w-4 h-4 text-slate-400" /><span>{s.atmosphericPressure ? `${s.atmosphericPressure} hPa` : '—'}</span></div>
            <div className="flex items-center gap-2"><FiShield className="w-4 h-4 text-slate-400" /><span>{s.verificationType === 'INSPECTION' ? 'MPE × 2 (in service)' : 'MPE × 1 (verification)'}</span></div>
          </dl>
          <div className="mt-3 text-[12px] text-slate-600"><b>{t('detail.standards', 'Standards')}:</b> {s.standardWeightsUsed || '—'}</div>
          {s.remarks && <div className="mt-2 text-[12px] text-slate-600"><b>{t('detail.remarks', 'Remarks')}:</b> {s.remarks}</div>}
        </div>
      </div>

      {/* Sealed banner */}
      {sealed && (
        <div className={`rounded-xl border p-5 flex flex-col md:flex-row md:items-center gap-4 ${s.overallResult === 'PASS' ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
          <span className={`w-12 h-12 rounded-full flex items-center justify-center shrink-0 ${s.overallResult === 'PASS' ? 'bg-green-700' : 'bg-red-700'} text-white`}>
            {s.overallResult === 'PASS' ? <FiCheckCircle className="w-6 h-6" /> : <FiXCircle className="w-6 h-6" />}
          </span>
          <div className="min-w-0 flex-1">
            <div className={`text-base font-extrabold ${s.overallResult === 'PASS' ? 'text-green-900' : 'text-red-900'}`}>
              {isTE
                ? s.overallResult === 'PASS'
                  ? t('detail.passTitleTE', 'Test sample meets all recorded OIML R 76 tests')
                  : t('detail.failTitleTE', 'Test sample failed one or more OIML R 76 tests')
                : s.overallResult === 'PASS'
                  ? t('detail.passTitle', 'Approved — conforms to OIML R 76')
                  : t('detail.failTitle', 'Rejected — not fit for use in trade')}
            </div>
            <div className="text-xs text-slate-600 mt-0.5">
              {t('detail.sealedAt', 'Digitally sealed {{d}} · readings are locked', { d: formatDateTime(s.sealedAt || s.completedAt) })}
            </div>
            <div className="mt-1.5 font-mono text-[11px] text-slate-500 truncate">HMAC-SHA256 {s.verificationSeal}</div>
          </div>
          <button type="button" onClick={() => navigate(`/reports/${s.id}`)} className="inline-flex items-center gap-2 h-10 px-4 rounded-md bg-white border border-slate-300 text-sm font-bold text-navy hover:bg-slate-50 shrink-0">
            <FiFileText className="w-4 h-4" /> {t('detail.openCert', 'Open certificate')}
          </button>
        </div>
      )}

      {/* Modules */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-[15px] font-bold text-slate-900">{t('detail.modulesTitle', 'OIML R 76 test programme')}</h2>
            <p className="text-xs text-slate-500">{isTE
              ? t('detail.modulesSubTE', 'Type evaluation: all {{n}} modules must be completed before the report can be sealed.', { n: total })
              : t('detail.modulesSubV', 'Verification: weighing, repeatability and eccentricity must be completed before sealing. Temperature, warm-up and creep are type-evaluation tests.')}</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-40 h-2 rounded-full bg-slate-100 overflow-hidden">
              <div className={`h-full ${sealed ? 'bg-green-600' : 'bg-primary-600'}`} style={{ width: `${(doneCount / total) * 100}%` }} />
            </div>
            <span className="text-sm font-extrabold text-navy">{doneCount}/{total}</span>
          </div>
        </div>
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-px bg-slate-200">
          {MODULES.map((m, idx) => {
            const r = byType[m.type];
            const state = !r ? 'NOT_STARTED' : r.status !== 'COMPLETED' ? 'IN_PROGRESS' : r.result;
            const fnd = r?.status === 'COMPLETED' ? finding(m.type, r.calculations, inst) : null;
            const accent = state === 'PASS' ? 'bg-green-600' : state === 'FAIL' ? 'bg-red-600' : state === 'IN_PROGRESS' ? 'bg-primary-600' : 'bg-slate-300';
            return (
              <div key={m.type} className="relative p-5 bg-white flex flex-col">
                <span className={`absolute left-0 top-5 bottom-5 w-1 rounded-r ${accent}`} />
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-bold text-slate-500">{t('detail.module', 'Module')} {idx + 1} · {m.clause}</span>
                  <StatusBadge status={state} size="xs" />
                </div>
                <h3 className="mt-1.5 text-[15px] font-bold text-slate-900">{moduleTitle(m.type)}</h3>
                <p className="text-xs text-slate-500 mt-1 leading-snug">{t(`moduleDesc.${m.type}`, MODULE_DESC[m.type])}</p>
                <div className={`mt-3 text-[12px] font-mono rounded px-2.5 py-1.5 ${fnd ? (state === 'FAIL' ? 'bg-red-50 text-red-800' : 'bg-slate-50 text-slate-700') : 'bg-slate-50 text-slate-400'}`}>
                  {fnd || (state === 'IN_PROGRESS' ? t('detail.partial', 'Readings saved — not yet completed') : t('detail.noReadings', 'No readings recorded'))}
                </div>
                <div className="mt-auto pt-4">
                  <button
                    type="button"
                    onClick={() => navigate(`/tests/${s.id}/${m.type}`)}
                    className={`w-full inline-flex items-center justify-center gap-2 h-9 rounded-md text-xs font-bold ${
                      sealed || !canEdit ? 'border border-slate-300 text-slate-700 hover:bg-slate-50' : state === 'NOT_STARTED' || state === 'IN_PROGRESS' ? 'bg-navy text-white hover:bg-navy-light' : 'border border-primary-300 text-primary-800 hover:bg-primary-50'
                    }`}
                  >
                    {sealed || !canEdit ? <FiEye className="w-3.5 h-3.5" /> : <FiEdit3 className="w-3.5 h-3.5" />}
                    {sealed || !canEdit
                      ? t('detail.viewReadings', 'View readings')
                      : state === 'NOT_STARTED'
                        ? t('detail.record', 'Record readings')
                        : state === 'IN_PROGRESS'
                          ? t('detail.continue', 'Continue recording')
                          : t('detail.review', 'Review / re-test')}
                    <FiArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Finalize dialog */}
      {confirmOpen && (
        <div className="fixed inset-0 z-[80] bg-slate-900/60 flex items-center justify-center p-4" onClick={() => !finalize.isPending && setConfirmOpen(false)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="fin-title">
            <TricolorBar thickness={3} />
            <div className="p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 id="fin-title" className="text-lg font-extrabold text-navy">{t('detail.finTitle', 'Finalise and digitally seal {{n}}', { n: s.certificateNo })}</h2>
                  <p className="text-sm text-slate-600 mt-1">{t('detail.finSub', 'Once sealed, readings are locked and the certificate is issued with an HMAC-SHA256 seal and a public QR code.')}</p>
                </div>
                <button type="button" onClick={() => setConfirmOpen(false)} className="p-1 rounded hover:bg-slate-100 text-slate-500" aria-label="Close"><FiX className="w-5 h-5" /></button>
              </div>
              <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-2">
                {MODULES.map((m) => (
                  <div key={m.type} className="flex items-center justify-between gap-2 px-3 py-2 rounded-md bg-slate-50 border border-slate-200 text-xs">
                    <span className="font-semibold text-slate-700 truncate">{moduleTitle(m.type)}</span>
                    <StatusBadge status={byType[m.type]?.result} size="xs" icon={false} />
                  </div>
                ))}
              </div>
              <div className={`mt-4 p-4 rounded-lg border flex items-center gap-3 ${predicted === 'PASS' ? 'bg-green-50 border-green-300' : 'bg-red-50 border-red-300'}`}>
                {predicted === 'PASS' ? <FiCheckCircle className="w-6 h-6 text-green-700" /> : <FiAlertTriangle className="w-6 h-6 text-red-700" />}
                <div>
                  <div className={`font-extrabold ${predicted === 'PASS' ? 'text-green-900' : 'text-red-900'}`}>
                    {isTE
                      ? t('detail.willTE', 'Outcome: OIML R 76 type evaluation test report ({{v}})', { v: predicted })
                      : predicted === 'PASS'
                        ? t('detail.willPass', 'Outcome: APPROVED — certificate of verification')
                        : t('detail.willFail', 'Outcome: REJECTED — certificate of rejection')}
                  </div>
                  <div className="text-xs text-slate-600">{t('detail.outcomeNote', 'Computed automatically from the recorded readings; it cannot be overridden.')}</div>
                </div>
              </div>
              <label className="block mt-4">
                <span className="block text-[12.5px] font-bold text-slate-700 mb-1.5">{t('detail.finRemarks', 'Officer’s remarks on the certificate')}</span>
                <textarea rows={3} value={finalRemarks} onChange={(e) => setFinalRemarks(e.target.value)} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md" />
              </label>
              <div className="mt-5 flex justify-end gap-2">
                <button type="button" onClick={() => setConfirmOpen(false)} className="h-10 px-4 rounded-md border border-slate-300 text-sm font-semibold text-slate-700 hover:bg-slate-50">{t('common.cancel', 'Cancel')}</button>
                <button type="button" onClick={() => finalize.mutate()} disabled={finalize.isPending} className="inline-flex items-center gap-2 h-10 px-5 rounded-md bg-green-700 hover:bg-green-800 text-white text-sm font-bold disabled:opacity-60">
                  <FiLock className="w-4 h-4" /> {finalize.isPending ? t('detail.sealing', 'Sealing…') : t('detail.sealBtn', 'Sign & seal certificate')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
