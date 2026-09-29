import React, { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { FiPlus, FiSearch, FiFileText, FiArrowRight, FiClipboard, FiX, FiChevronLeft, FiChevronRight } from 'react-icons/fi';

import apiClient from '../../hooks/useApi';
import PageHeader from '../../components/shared/PageHeader';
import StatusBadge from '../../components/shared/StatusBadge';
import { useAuth } from '../../contexts/AuthContext';
import { formatDate, verificationTypeLabel, VERIFICATION_TYPES } from '../../utils/format';

const PAGE = 12;

export default function TestSessionListPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { isInspector } = useAuth();
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const [vType, setVType] = useState('');
  const [officer, setOfficer] = useState('');
  const [page, setPage] = useState(1);
  const status = params.get('status') || '';
  const verdict = params.get('result') || '';

  const { data: sessions = [], isLoading } = useQuery({
    queryKey: ['test-sessions-all'],
    queryFn: async () => (await apiClient.get('/tests', { params: { limit: 500 } })).data?.data || [],
  });

  const officers = useMemo(() => [...new Map(sessions.filter((s) => s.conductedBy).map((s) => [s.conductedBy.id, s.conductedBy.name])).entries()], [sessions]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return sessions.filter((s) => {
      if (q && ![s.certificateNo, s.instrument?.name, s.instrument?.serialNumber, s.conductedBy?.name].some((v) => v?.toLowerCase().includes(q))) return false;
      if (status && s.status !== status) return false;
      if (verdict && s.overallResult !== verdict) return false;
      if (vType && s.verificationType !== vType) return false;
      if (officer && s.conductedBy?.id !== officer) return false;
      return true;
    });
  }, [sessions, search, status, verdict, vType, officer]);

  const pages = Math.max(1, Math.ceil(rows.length / PAGE));
  const current = Math.min(page, pages);
  const visible = rows.slice((current - 1) * PAGE, current * PAGE);

  const setParam = (k, v) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v);
    else next.delete(k);
    setParams(next, { replace: true });
    setPage(1);
  };

  const tabs = [
    ['', '', t('common.all', 'All'), sessions.length],
    ['IN_PROGRESS', '', t('status.inProgress', 'In Progress'), sessions.filter((s) => s.status === 'IN_PROGRESS').length],
    ['COMPLETED', 'PASS', t('sessions.approved', 'Approved'), sessions.filter((s) => s.overallResult === 'PASS').length],
    ['COMPLETED', 'FAIL', t('sessions.rejected', 'Rejected'), sessions.filter((s) => s.overallResult === 'FAIL').length],
  ];
  const selectCls = 'h-10 px-3 text-sm bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500/30';

  return (
    <div>
      <PageHeader
        icon={FiClipboard}
        eyebrow={t('sessions.eyebrow', 'OIML R 76 test records')}
        title={t('sessions.title', 'Verification Sessions')}
        subtitle={t('sessions.subtitle', 'Every verification, re-verification and inspection — open work and sealed certificates.')}
        actions={
          isInspector && (
            <button type="button" onClick={() => navigate('/tests/new')} className="inline-flex items-center gap-2 h-10 px-4 rounded-md bg-navy text-white text-sm font-bold hover:bg-navy-light">
              <FiPlus className="w-4 h-4" /> {t('nav.startVerification', 'Start Verification')}
            </button>
          )
        }
      />

      <div className="flex flex-wrap gap-2 mb-4">
        {tabs.map(([st, vd, label, n]) => {
          const active = status === st && verdict === vd;
          return (
            <button
              key={label}
              type="button"
              onClick={() => {
                const next = new URLSearchParams(params);
                st ? next.set('status', st) : next.delete('status');
                vd ? next.set('result', vd) : next.delete('result');
                setParams(next, { replace: true });
                setPage(1);
              }}
              className={`h-9 px-3.5 rounded-full text-[13px] font-semibold border ${active ? 'bg-navy text-white border-navy' : 'bg-white text-slate-700 border-slate-300 hover:border-navy'}`}
            >
              {label} <span className="ml-1 opacity-70">{n}</span>
            </button>
          );
        })}
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-3 mb-4 flex flex-col lg:flex-row gap-2">
        <div className="relative flex-1">
          <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder={t('sessions.search', 'Search certificate no., instrument, serial or officer…')}
            className="w-full h-10 pl-10 pr-3 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500/30"
          />
        </div>
        <select value={vType} onChange={(e) => { setVType(e.target.value); setPage(1); }} className={selectCls} aria-label="Verification type">
          <option value="">{t('sessions.allTypes', 'All verification types')}</option>
          {Object.keys(VERIFICATION_TYPES).map((k) => <option key={k} value={k}>{verificationTypeLabel(k)}</option>)}
        </select>
        <select value={officer} onChange={(e) => { setOfficer(e.target.value); setPage(1); }} className={selectCls} aria-label="Officer">
          <option value="">{t('sessions.allOfficers', 'All officers')}</option>
          {officers.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
        </select>
        {(search || vType || officer || status || verdict) && (
          <button type="button" onClick={() => { setSearch(''); setVType(''); setOfficer(''); setParams({}, { replace: true }); setPage(1); }} className="inline-flex items-center gap-1 h-10 px-3 text-sm font-semibold text-slate-600 hover:text-red-700">
            <FiX className="w-4 h-4" /> {t('common.clear', 'Clear')}
          </button>
        )}
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
              <tr>
                <th className="text-left font-bold px-5 py-3">{t('table.certificate', 'Certificate no.')}</th>
                <th className="text-left font-bold px-3 py-3">{t('table.instrument', 'Instrument')}</th>
                <th className="text-left font-bold px-3 py-3">{t('table.type', 'Type')}</th>
                <th className="text-left font-bold px-3 py-3">{t('sessions.progress', 'Progress')}</th>
                <th className="text-left font-bold px-3 py-3">{t('table.date', 'Date')}</th>
                <th className="text-left font-bold px-3 py-3">{t('table.officer', 'Officer')}</th>
                <th className="text-left font-bold px-3 py-3">{t('table.result', 'Result')}</th>
                <th className="text-right font-bold px-5 py-3">{t('common.actions', 'Actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading && (
                <tr><td colSpan={8} className="px-5 py-10 text-center text-sm text-slate-500">{t('common.loading', 'Loading…')}</td></tr>
              )}
              {!isLoading && visible.length === 0 && (
                <tr><td colSpan={8} className="px-5 py-12 text-center text-sm text-slate-500">{t('sessions.none', 'No sessions match these filters.')}</td></tr>
              )}
              {visible.map((s) => {
                const done = (s.testResults || []).filter((r) => r.status === 'COMPLETED').length;
                const sealed = s.status === 'COMPLETED';
                return (
                  <tr key={s.id} className="hover:bg-primary-50/30 cursor-pointer" onClick={() => navigate(`/tests/${s.id}`)}>
                    <td className="px-5 py-3 font-mono text-[12.5px] font-semibold text-primary-700 whitespace-nowrap">{s.certificateNo}</td>
                    <td className="px-3 py-3">
                      <div className="font-semibold text-slate-800 truncate max-w-[260px]">{s.instrument?.name}</div>
                      <div className="text-[11px] text-slate-500 font-mono">S/N {s.instrument?.serialNumber}</div>
                    </td>
                    <td className="px-3 py-3 text-xs text-slate-600">{verificationTypeLabel(s.verificationType)}</td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-1.5">
                        <div className="flex gap-0.5">
                          {Array.from({ length: 6 }, (_, i) => (
                            <span key={i} className={`h-1.5 w-3 rounded-full ${i < done ? (sealed ? 'bg-green-600' : 'bg-primary-600') : 'bg-slate-200'}`} />
                          ))}
                        </div>
                        <span className="text-[11px] font-bold text-slate-600">{done}/6</span>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-xs text-slate-600 whitespace-nowrap">{formatDate(s.completedAt || s.startedAt)}</td>
                    <td className="px-3 py-3 text-xs text-slate-700">{s.conductedBy?.name}</td>
                    <td className="px-3 py-3"><StatusBadge status={sealed ? s.overallResult : 'IN_PROGRESS'} size="xs" /></td>
                    <td className="px-5 py-3 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                      {sealed && (
                        <button type="button" onClick={() => navigate(`/reports/${s.id}`)} className="inline-flex items-center gap-1 h-8 px-2.5 mr-1.5 rounded-md border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-white" title={t('common.certificate', 'Certificate')}>
                          <FiFileText className="w-3.5 h-3.5" /> {t('common.certificate', 'Certificate')}
                        </button>
                      )}
                      <button type="button" onClick={() => navigate(`/tests/${s.id}`)} className={`inline-flex items-center gap-1 h-8 px-2.5 rounded-md text-xs font-bold ${sealed ? 'bg-primary-50 text-primary-800 hover:bg-primary-100' : 'bg-navy text-white hover:bg-navy-light'}`}>
                        {sealed ? t('common.open', 'Open') : t('dash.resume', 'Resume')} <FiArrowRight className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="px-5 py-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-600">
          <span>{t('sessions.showing', 'Showing {{a}}–{{b}} of {{n}}', { a: rows.length ? (current - 1) * PAGE + 1 : 0, b: Math.min(current * PAGE, rows.length), n: rows.length })}</span>
          <div className="flex items-center gap-1">
            <button type="button" disabled={current <= 1} onClick={() => setPage(current - 1)} className="w-8 h-8 inline-flex items-center justify-center rounded border border-slate-300 disabled:opacity-40 hover:bg-slate-50" aria-label="Previous page">
              <FiChevronLeft className="w-4 h-4" />
            </button>
            <span className="px-2 font-semibold">{current} / {pages}</span>
            <button type="button" disabled={current >= pages} onClick={() => setPage(current + 1)} className="w-8 h-8 inline-flex items-center justify-center rounded border border-slate-300 disabled:opacity-40 hover:bg-slate-50" aria-label="Next page">
              <FiChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
