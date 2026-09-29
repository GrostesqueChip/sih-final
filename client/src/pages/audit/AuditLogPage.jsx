import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { FiShield, FiSearch, FiDownload, FiChevronLeft, FiChevronRight, FiLock } from 'react-icons/fi';

import apiClient from '../../hooks/useApi';
import PageHeader from '../../components/shared/PageHeader';
import { formatDateTime, initials } from '../../utils/format';

const ACTIONS = {
  LOGIN: ['Signed in', 'bg-slate-100 text-slate-700'],
  LOGOUT: ['Signed out', 'bg-slate-100 text-slate-700'],
  LOGIN_FAILED: ['Failed sign-in', 'bg-red-50 text-red-700'],
  LOGIN_BLOCKED: ['Blocked sign-in', 'bg-red-50 text-red-700'],
  SYSTEM_INITIALIZED: ['System initialised', 'bg-slate-100 text-slate-700'],
  CREATE_USER: ['Officer account created', 'bg-violet-50 text-violet-700'],
  UPDATE_USER: ['Officer account updated', 'bg-violet-50 text-violet-700'],
  DEACTIVATE_USER: ['Officer deactivated', 'bg-violet-50 text-violet-700'],
  CREATE_INSTRUMENT: ['Instrument registered', 'bg-sky-50 text-sky-700'],
  UPDATE_INSTRUMENT: ['Instrument updated', 'bg-sky-50 text-sky-700'],
  DEACTIVATE_INSTRUMENT: ['Instrument withdrawn', 'bg-sky-50 text-sky-700'],
  OFFLINE_SYNC_SESSION: ['Offline records synced', 'bg-primary-50 text-primary-800'],
  RESET_DEMO_DATA: ['Demo data restored', 'bg-slate-100 text-slate-700'],
  CREATE_TEST_SESSION: ['Verification opened', 'bg-primary-50 text-primary-800'],
  UPDATE_TEST_SESSION: ['Session updated', 'bg-primary-50 text-primary-800'],
  ENTER_TEST_DATA: ['Readings recorded', 'bg-amber-50 text-amber-800'],
  MODIFY_TEST: ['Readings modified', 'bg-amber-50 text-amber-800'],
  FINALIZE_TEST_SESSION: ['Sealed & certified', 'bg-green-50 text-green-800'],
  GENERATE_CERTIFICATE_PDF: ['Certificate generated', 'bg-green-50 text-green-800'],
  GENERATE_DATASHEET_PDF: ['Data sheet generated', 'bg-green-50 text-green-800'],
};
const PAGE = 20;

function entityLink(log) {
  if (log.entityType === 'TestSession') return `/tests/${log.entityId}`;
  if (log.entityType === 'Instrument') return `/instruments/${log.entityId}`;
  return null;
}

export default function AuditLogPage() {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const [action, setAction] = useState('');
  const [officer, setOfficer] = useState('');
  const [page, setPage] = useState(1);

  const { data: logs = [], isLoading } = useQuery({
    queryKey: ['audit-logs'],
    queryFn: async () => (await apiClient.get('/audit', { params: { limit: 1000 } })).data?.data || [],
  });

  const officers = useMemo(() => [...new Map(logs.filter((l) => l.user).map((l) => [l.user.id, l.user.name])).entries()], [logs]);
  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return logs.filter((l) => (!action || l.action === action) && (!officer || l.userId === officer) && (!q || [l.details, l.entityId, l.user?.name, l.ipAddress].some((v) => v?.toLowerCase().includes(q))));
  }, [logs, search, action, officer]);
  const pages = Math.max(1, Math.ceil(rows.length / PAGE));
  const cur = Math.min(page, pages);
  const visible = rows.slice((cur - 1) * PAGE, cur * PAGE);

  const exportCsv = () => {
    const head = ['Timestamp (IST)', 'Officer', 'Role', 'Action', 'Entity', 'Details', 'IP'];
    const lines = rows.map((l) => [formatDateTime(l.createdAt), l.user?.name || 'System', l.user?.role || '', l.action, `${l.entityType || ''} ${l.entityId || ''}`, l.details, l.ipAddress].map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(','));
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([[head.join(','), ...lines].join('\n')], { type: 'text/csv' }));
    a.download = `audit-trail-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  };

  return (
    <div>
      <PageHeader
        icon={FiShield}
        eyebrow={t('audit.eyebrow', 'Accountability')}
        title={t('audit.title', 'Audit Trail')}
        subtitle={t('audit.subtitle', 'Every sign-in, registration, reading and certificate — who did it, when, and from where.')}
        actions={
          <button type="button" onClick={exportCsv} className="inline-flex items-center gap-2 h-10 px-4 rounded-md border border-slate-300 bg-white text-sm font-semibold text-slate-700 hover:bg-slate-50">
            <FiDownload className="w-4 h-4" /> {t('common.exportCsv', 'Export CSV')}
          </button>
        }
      />

      <div className="mb-4 p-4 rounded-xl bg-primary-50 border border-primary-100 text-[13px] text-primary-900 flex gap-3">
        <FiLock className="w-5 h-5 shrink-0 text-primary-700" />
        <span>
          {t(
            'audit.banner',
            'Append-only record: entries are written by the server for every action and cannot be edited or deleted from the application. Sealed certificates are independently protected by their HMAC-SHA256 seal.'
          )}
        </span>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-3 mb-4 flex flex-col lg:flex-row gap-2">
        <div className="relative flex-1">
          <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder={t('audit.search', 'Search details, certificate no., officer or IP…')} className="w-full h-10 pl-10 pr-3 text-sm border border-slate-300 rounded-md" />
        </div>
        <select value={action} onChange={(e) => { setAction(e.target.value); setPage(1); }} className="h-10 px-3 text-sm border border-slate-300 rounded-md" aria-label="Action">
          <option value="">{t('audit.allActions', 'All actions')}</option>
          {Object.entries(ACTIONS).map(([k, [label]]) => <option key={k} value={k}>{label}</option>)}
        </select>
        <select value={officer} onChange={(e) => { setOfficer(e.target.value); setPage(1); }} className="h-10 px-3 text-sm border border-slate-300 rounded-md" aria-label="Officer">
          <option value="">{t('sessions.allOfficers', 'All officers')}</option>
          {officers.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
        </select>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
              <tr>
                <th className="text-left font-bold px-5 py-3">{t('audit.when', 'Timestamp (IST)')}</th>
                <th className="text-left font-bold px-3 py-3">{t('table.officer', 'Officer')}</th>
                <th className="text-left font-bold px-3 py-3">{t('audit.action', 'Action')}</th>
                <th className="text-left font-bold px-3 py-3">{t('audit.details', 'Details')}</th>
                <th className="text-left font-bold px-5 py-3">{t('audit.ip', 'IP address')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading && <tr><td colSpan={5} className="px-5 py-10 text-center text-slate-500">{t('common.loading', 'Loading…')}</td></tr>}
              {!isLoading && visible.length === 0 && <tr><td colSpan={5} className="px-5 py-10 text-center text-slate-500">{t('audit.none', 'No entries match.')}</td></tr>}
              {visible.map((l) => {
                const [label, cls] = ACTIONS[l.action] || [l.action, 'bg-slate-100 text-slate-700'];
                const link = entityLink(l);
                return (
                  <tr key={l.id} className="hover:bg-slate-50 align-top">
                    <td className="px-5 py-3 text-xs text-slate-600 whitespace-nowrap font-mono">{formatDateTime(l.createdAt)}</td>
                    <td className="px-3 py-3">
                      {l.user ? (
                        <div className="flex items-center gap-2">
                          <span className="w-7 h-7 rounded-full bg-primary-100 text-primary-800 text-[10px] font-bold flex items-center justify-center shrink-0">{initials(l.user.name)}</span>
                          <div className="min-w-0">
                            <div className="text-[13px] font-semibold text-slate-800 whitespace-nowrap">{l.user.name}</div>
                            <div className="text-[10.5px] text-slate-500">{t(`roles.${l.user.role}`, l.user.role)}</div>
                          </div>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-500">{t('audit.system', 'System / anonymous')}</span>
                      )}
                    </td>
                    <td className="px-3 py-3"><span className={`inline-flex whitespace-nowrap text-[11px] font-bold px-2 py-1 rounded ${cls}`}>{label}</span></td>
                    <td className="px-3 py-3 text-[13px] text-slate-700 max-w-xl">
                      {l.details}
                      {link && (
                        <Link to={link} className="ml-1.5 text-[11px] font-bold text-primary-700 hover:underline whitespace-nowrap">{t('audit.open', 'open ›')}</Link>
                      )}
                    </td>
                    <td className="px-5 py-3 text-xs font-mono text-slate-500">{l.ipAddress}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="px-5 py-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-600">
          <span>{t('sessions.showing', 'Showing {{a}}–{{b}} of {{n}}', { a: rows.length ? (cur - 1) * PAGE + 1 : 0, b: Math.min(cur * PAGE, rows.length), n: rows.length })}</span>
          <div className="flex items-center gap-1">
            <button type="button" disabled={cur <= 1} onClick={() => setPage(cur - 1)} className="w-8 h-8 inline-flex items-center justify-center rounded border border-slate-300 disabled:opacity-40" aria-label="Previous page"><FiChevronLeft className="w-4 h-4" /></button>
            <span className="px-2 font-semibold">{cur} / {pages}</span>
            <button type="button" disabled={cur >= pages} onClick={() => setPage(cur + 1)} className="w-8 h-8 inline-flex items-center justify-center rounded border border-slate-300 disabled:opacity-40" aria-label="Next page"><FiChevronRight className="w-4 h-4" /></button>
          </div>
        </div>
      </div>
    </div>
  );
}
