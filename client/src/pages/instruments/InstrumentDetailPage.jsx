import React, { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { FiEdit2, FiPlayCircle, FiMapPin, FiUser, FiCalendar, FiFileText, FiArrowRight, FiHash, FiShield } from 'react-icons/fi';

import apiClient from '../../hooks/useApi';
import StatusBadge from '../../components/shared/StatusBadge';
import LoadingSpinner from '../../components/shared/LoadingSpinner';
import { useAuth } from '../../contexts/AuthContext';
import { MPE_TIERS } from '../../utils/metrology';
import {
  classLabel,
  CLASS_DESC,
  typeLabel,
  formatDate,
  instrumentPhoto,
  formatMass,
  verificationTypeLabel,
  complianceLabel,
} from '../../utils/format';

function Spec({ label, value, mono }) {
  return (
    <div className="p-3 rounded-lg bg-slate-50 border border-slate-100">
      <div className="text-[10.5px] font-bold uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`mt-1 text-[15px] font-bold text-slate-900 ${mono ? 'font-mono text-[13px]' : ''}`}>{value}</div>
    </div>
  );
}

export default function InstrumentDetailPage() {
  const { t } = useTranslation();
  const { id } = useParams();
  const navigate = useNavigate();
  const { isInspector } = useAuth();
  const [tab, setTab] = useState('history');

  const { data: inst, isLoading, isError } = useQuery({
    queryKey: ['instrument', id],
    queryFn: async () => (await apiClient.get(`/instruments/${id}`)).data?.data,
  });

  if (isLoading) return <LoadingSpinner message={t('common.loading', 'Loading…')} />;
  if (isError || !inst) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-10 text-center">
        <h2 className="text-lg font-bold text-slate-900">{t('instr.notFound', 'Instrument not found')}</h2>
        <button type="button" onClick={() => navigate('/instruments')} className="mt-4 h-10 px-4 rounded-md bg-navy text-white text-sm font-bold">
          {t('instr.backToRegistry', 'Back to registry')}
        </button>
      </div>
    );
  }

  const c = inst.compliance || { status: 'NOT_VERIFIED' };
  const sessions = inst.testSessions || [];
  const e = Number(inst.verificationInterval);
  const n = Math.round(Number(inst.maxCapacity) / e);
  const tiers = (MPE_TIERS[inst.accuracyClass] || []).filter((tier) => tier.minLoad < n);
  const unit = inst.unit || 'kg';
  const massFmt = (v) => formatMass(v, inst);
  const validPct = c.daysRemaining != null ? Math.max(0, Math.min(100, (c.daysRemaining / 365) * 100)) : 0;

  const statusPanel = {
    VALID: 'border-green-200 bg-green-50',
    DUE_SOON: 'border-amber-200 bg-amber-50',
    EXPIRED: 'border-red-200 bg-red-50',
    REJECTED: 'border-red-200 bg-red-50',
    NOT_VERIFIED: 'border-slate-200 bg-slate-50',
  }[c.status];

  return (
    <div className="space-y-5">
      {/* Hero */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="grid lg:grid-cols-[340px_1fr]">
          <div className="relative h-56 lg:h-auto bg-slate-100">
            <img src={instrumentPhoto(inst)} alt={inst.name} className="absolute inset-0 w-full h-full object-cover" />
            <div className="absolute inset-x-0 bottom-0 p-3 bg-gradient-to-t from-black/70 to-transparent">
              <span className="inline-flex text-[11px] font-bold uppercase tracking-wide px-2 py-1 rounded bg-white/90 text-navy">{typeLabel(inst.type)}</span>
            </div>
          </div>
          <div className="p-5 sm:p-6">
            <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <StatusBadge status={c.status} size="md" />
                  <span className="text-xs font-bold px-2 py-1 rounded bg-navy text-white">{classLabel(inst.accuracyClass)}</span>
                </div>
                <h1 className="mt-2 text-2xl font-extrabold text-navy leading-tight">{inst.name}</h1>
                <p className="text-sm text-slate-600 mt-1">
                  {inst.manufacturer} · {inst.model} · <span className="font-mono">S/N {inst.serialNumber}</span>
                </p>
                <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-[13px] text-slate-600">
                  <span className="flex items-center gap-1.5"><FiUser className="w-4 h-4 text-slate-400" /> {inst.ownerName || '—'}</span>
                  <span className="flex items-center gap-1.5"><FiMapPin className="w-4 h-4 text-slate-400" /> {inst.location}{inst.district && !inst.location?.includes(inst.district) ? `, ${inst.district}` : ''}</span>
                  <span className="flex items-center gap-1.5"><FiCalendar className="w-4 h-4 text-slate-400" /> {t('instr.registered', 'Registered')} {formatDate(inst.createdAt)}</span>
                </div>
              </div>
              {isInspector && (
                <div className="flex gap-2 shrink-0">
                  <button type="button" onClick={() => navigate(`/instruments/${id}/edit`)} className="inline-flex items-center gap-2 h-10 px-4 rounded-md border border-slate-300 bg-white text-sm font-semibold text-slate-700 hover:bg-slate-50">
                    <FiEdit2 className="w-4 h-4" /> {t('common.edit', 'Edit')}
                  </button>
                  <button type="button" onClick={() => navigate(`/tests/new?instrumentId=${id}`)} className="inline-flex items-center gap-2 h-10 px-4 rounded-md bg-navy text-white text-sm font-bold hover:bg-navy-light">
                    <FiPlayCircle className="w-4 h-4" /> {t('instr.startTest', 'Start verification')}
                  </button>
                </div>
              )}
            </div>

            <div className="mt-5 grid grid-cols-2 md:grid-cols-4 gap-3">
              <Spec label={t('instr.max', 'Maximum capacity (Max)')} value={`${massFmt(inst.maxCapacity)} ${unit}`} />
              <Spec label={t('instr.min', 'Minimum capacity (Min)')} value={`${massFmt(inst.minCapacity)} ${unit}`} />
              <Spec label={t('instr.e', 'Verification interval (e)')} value={`${inst.verificationInterval} ${unit}`} />
              <Spec label={t('instr.n', 'Number of intervals (n)')} value={n.toLocaleString('en-IN')} />
            </div>
          </div>
        </div>
      </div>

      {/* Stamping status */}
      <div className={`rounded-xl border p-5 grid gap-5 md:grid-cols-[1fr_auto] items-center ${statusPanel}`}>
        <div>
          <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
            <FiShield className="w-4 h-4" /> {t('instr.stampingTitle', 'Stamping & verification status')}: {complianceLabel(c.status)}
          </div>
          <p className="text-[13px] text-slate-700 mt-1">
            {c.status === 'VALID' && t('instr.validMsg', 'Verified on {{a}}. Certificate valid until {{b}} ({{d}} days remaining).', { a: formatDate(c.lastVerifiedAt), b: formatDate(c.validUntil), d: c.daysRemaining })}
            {c.status === 'DUE_SOON' && t('instr.dueMsg', 'Certificate expires on {{b}} — only {{d}} days left. Schedule periodic re-verification.', { b: formatDate(c.validUntil), d: c.daysRemaining })}
            {c.status === 'EXPIRED' && t('instr.expiredMsg', 'Certificate expired on {{b}}. The instrument must not be used for trade until re-verified.', { b: formatDate(c.validUntil) })}
            {c.status === 'REJECTED' && t('instr.rejectedMsg', 'Rejected on {{a}} (certificate {{n}}). Sealed against commercial use until repaired and re-verified.', { a: formatDate(c.lastVerifiedAt), n: c.lastCertificateNo })}
            {c.status === 'NOT_VERIFIED' && (c.inProgress ? t('instr.nvProgress', 'First verification is in progress.') : t('instr.nvMsg', 'Registered but not yet verified. It may not be used for trade until verified and stamped.'))}
          </p>
          {c.daysRemaining != null && (
            <div className="mt-3 max-w-md">
              <div className="h-2 rounded-full bg-white/80 border border-slate-200 overflow-hidden">
                <div className={`h-full ${c.status === 'DUE_SOON' ? 'bg-amber-500' : 'bg-green-600'}`} style={{ width: `${validPct}%` }} />
              </div>
              <div className="flex justify-between text-[11px] text-slate-500 mt-1">
                <span>{formatDate(c.lastVerifiedAt)}</span>
                <span>{formatDate(c.validUntil)}</span>
              </div>
            </div>
          )}
        </div>
        {c.lastSessionId && (
          <button type="button" onClick={() => navigate(`/reports/${c.lastSessionId}`)} className="inline-flex items-center gap-2 h-10 px-4 rounded-md bg-white border border-slate-300 text-sm font-bold text-navy hover:bg-slate-50">
            <FiFileText className="w-4 h-4" /> {t('instr.viewCert', 'View latest certificate')}
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="flex border-b border-slate-200 px-2" role="tablist">
          {[
            ['history', t('instr.tabHistory', 'Verification history ({{n}})', { n: sessions.length })],
            ['mpe', t('instr.tabMpe', 'Maximum permissible errors')],
          ].map(([k, label]) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={tab === k}
              onClick={() => setTab(k)}
              className={`px-4 h-12 text-sm font-semibold border-b-2 -mb-px ${tab === k ? 'border-saffron-500 text-navy' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === 'history' && (
          <div className="overflow-x-auto">
            {sessions.length === 0 ? (
              <div className="p-10 text-center text-sm text-slate-500">{t('instr.noHistory', 'No verification has been recorded for this instrument yet.')}</div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="text-left font-bold px-5 py-2.5">{t('table.certificate', 'Certificate no.')}</th>
                    <th className="text-left font-bold px-3 py-2.5">{t('table.type', 'Type')}</th>
                    <th className="text-left font-bold px-3 py-2.5">{t('table.date', 'Date')}</th>
                    <th className="text-left font-bold px-3 py-2.5">{t('table.officer', 'Officer')}</th>
                    <th className="text-left font-bold px-3 py-2.5">{t('table.result', 'Result')}</th>
                    <th className="text-right font-bold px-5 py-2.5">{t('common.actions', 'Actions')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {sessions.map((s) => (
                    <tr key={s.id} className="hover:bg-slate-50">
                      <td className="px-5 py-3 font-mono text-[12.5px] font-semibold text-primary-700">{s.certificateNo}</td>
                      <td className="px-3 py-3 text-xs text-slate-700">{verificationTypeLabel(s.verificationType)}</td>
                      <td className="px-3 py-3 text-xs text-slate-700 whitespace-nowrap">{formatDate(s.completedAt || s.startedAt)}</td>
                      <td className="px-3 py-3 text-xs text-slate-700">{s.conductedBy?.name}</td>
                      <td className="px-3 py-3"><StatusBadge status={s.status === 'COMPLETED' ? s.overallResult : 'IN_PROGRESS'} size="xs" /></td>
                      <td className="px-5 py-3 text-right whitespace-nowrap">
                        {s.status === 'COMPLETED' && (
                          <button type="button" onClick={() => navigate(`/reports/${s.id}`)} className="inline-flex items-center gap-1 h-8 px-2.5 mr-1.5 rounded-md border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-white">
                            <FiFileText className="w-3.5 h-3.5" /> {t('common.certificate', 'Certificate')}
                          </button>
                        )}
                        <button type="button" onClick={() => navigate(`/tests/${s.id}`)} className="inline-flex items-center gap-1 h-8 px-2.5 rounded-md bg-primary-50 text-primary-800 text-xs font-bold hover:bg-primary-100">
                          {t('common.open', 'Open')} <FiArrowRight className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {tab === 'mpe' && (
          <div className="p-5">
            <p className="text-[13px] text-slate-600 mb-4">
              {t('instr.mpeIntro', 'OIML R 76-1 Table 6 for {{c}} ({{d}}), e = {{e}} {{u}}. In-service inspection limits are twice the verification limits.', {
                c: classLabel(inst.accuracyClass),
                d: CLASS_DESC[inst.accuracyClass] || '',
                e: inst.verificationInterval,
                u: unit,
              })}
            </p>
            <table className="w-full text-sm border border-slate-200 rounded-lg overflow-hidden">
              <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="text-left font-bold px-4 py-2.5">{t('instr.loadRange', 'Load range (m in e)')}</th>
                  <th className="text-left font-bold px-4 py-2.5">{t('instr.loadRangeMass', 'Load range ({{u}})', { u: unit })}</th>
                  <th className="text-right font-bold px-4 py-2.5">{t('instr.mpeVerif', 'MPE — verification')}</th>
                  <th className="text-right font-bold px-4 py-2.5">{t('instr.mpeService', 'MPE — in service')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {tiers.map((tier) => {
                  const hi = Math.min(tier.maxLoad, n);
                  return (
                    <tr key={tier.stepName}>
                      <td className="px-4 py-2.5 font-mono text-[12.5px]">{tier.minLoad.toLocaleString('en-IN')} e &lt; m ≤ {hi.toLocaleString('en-IN')} e</td>
                      <td className="px-4 py-2.5 font-mono text-[12.5px]">
                        {massFmt(tier.minLoad * e)} – {massFmt(hi * e)}
                      </td>
                      <td className="px-4 py-2.5 text-right font-bold">± {tier.mpeInitial} e = ± {massFmt(tier.mpeInitial * e)} {unit}</td>
                      <td className="px-4 py-2.5 text-right text-slate-600">± {massFmt(tier.mpeInitial * 2 * e)} {unit}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="mt-3 text-[11px] text-slate-500 flex items-center gap-1.5">
              <FiHash className="w-3 h-3" /> {t('instr.dNote', 'Actual scale interval d = {{d}} {{u}}', { d: inst.actualInterval, u: unit })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
