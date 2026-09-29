import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { FiFileText, FiDownload, FiSearch, FiArrowRight, FiCheckCircle, FiXCircle, FiAward } from 'react-icons/fi';

import apiClient from '../../hooks/useApi';
import PageHeader from '../../components/shared/PageHeader';
import StatusBadge from '../../components/shared/StatusBadge';
import { formatDate, verificationTypeLabel, classLabel } from '../../utils/format';

export default function ReportsHubPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [result, setResult] = useState('');
  const [busy, setBusy] = useState(null);

  const { data: sessions = [], isLoading } = useQuery({
    queryKey: ['test-sessions-all'],
    queryFn: async () => (await apiClient.get('/tests', { params: { limit: 500 } })).data?.data || [],
  });

  const sealed = useMemo(() => sessions.filter((s) => s.status === 'COMPLETED' && s.verificationSeal !== undefined), [sessions]);
  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return sealed.filter((s) => (!result || s.overallResult === result) && (!q || [s.certificateNo, s.instrument?.name, s.instrument?.serialNumber, s.conductedBy?.name].some((v) => v?.toLowerCase().includes(q))));
  }, [sealed, search, result]);

  const download = async (s, kind) => {
    setBusy(`${s.id}-${kind}`);
    try {
      const res = await apiClient.get(`/reports/${s.id}/${kind}`, { responseType: 'blob' });
      const url = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `${kind === 'certificate' ? 'Certificate' : 'Datasheet'}_${s.certificateNo}.pdf`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      toast.success(t('hub.downloaded', 'Downloaded {{n}}', { n: a.download }));
    } catch {
      toast.error(t('hub.fail', 'Could not generate the PDF'));
    } finally {
      setBusy(null);
    }
  };

  const exportCsv = () => {
    const head = ['Certificate No', 'Result', 'Instrument', 'Serial', 'Class', 'Verification type', 'Date', 'Officer'];
    const lines = rows.map((s) => [s.certificateNo, s.overallResult, s.instrument?.name, s.instrument?.serialNumber, classLabel(s.instrument?.accuracyClass), verificationTypeLabel(s.verificationType), new Date(s.completedAt).toISOString().slice(0, 10), s.conductedBy?.name].map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(','));
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([[head.join(','), ...lines].join('\n')], { type: 'text/csv' }));
    a.download = `certificate-register-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  };

  const approved = sealed.filter((s) => s.overallResult === 'PASS').length;

  return (
    <div>
      <PageHeader
        icon={FiAward}
        eyebrow={t('hub.eyebrow', 'Register of certificates')}
        title={t('hub.title', 'Certificates & Reports')}
        subtitle={t('hub.subtitle', 'Every sealed certificate of verification or rejection, with its technical data sheet.')}
        actions={
          <button type="button" onClick={exportCsv} className="inline-flex items-center gap-2 h-10 px-4 rounded-md border border-slate-300 bg-white text-sm font-semibold text-slate-700 hover:bg-slate-50">
            <FiDownload className="w-4 h-4" /> {t('common.exportCsv', 'Export CSV')}
          </button>
        }
      />

      <div className="grid sm:grid-cols-3 gap-4 mb-4">
        {[
          [FiFileText, t('hub.issued', 'Certificates issued'), sealed.length, 'bg-primary-50 text-primary-700', ''],
          [FiCheckCircle, t('hub.approved', 'Approved (verification)'), approved, 'bg-green-50 text-green-700', 'PASS'],
          [FiXCircle, t('hub.rejected', 'Rejected (rejection)'), sealed.length - approved, 'bg-red-50 text-red-700', 'FAIL'],
        ].map(([Icon, label, n, cls, key]) => (
          <button key={label} type="button" onClick={() => setResult(result === key ? '' : key)} className={`text-left bg-white border rounded-xl p-5 flex items-center justify-between hover:shadow-md transition-shadow ${result === key && key ? 'border-navy ring-2 ring-navy/20' : 'border-slate-200'}`}>
            <div>
              <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{label}</div>
              <div className="text-3xl font-extrabold text-navy mt-1">{n}</div>
            </div>
            <span className={`w-11 h-11 rounded-lg flex items-center justify-center ${cls}`}><Icon className="w-5 h-5" /></span>
          </button>
        ))}
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="p-3 border-b border-slate-100 flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('hub.search', 'Search certificate no., instrument, serial or officer…')} className="w-full h-10 pl-10 pr-3 text-sm border border-slate-300 rounded-md" />
          </div>
          <select value={result} onChange={(e) => setResult(e.target.value)} className="h-10 px-3 text-sm border border-slate-300 rounded-md" aria-label="Result">
            <option value="">{t('hub.allResults', 'All results')}</option>
            <option value="PASS">{t('hub.onlyPass', 'Approved only')}</option>
            <option value="FAIL">{t('hub.onlyFail', 'Rejected only')}</option>
          </select>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
              <tr>
                <th className="text-left font-bold px-5 py-3">{t('table.certificate', 'Certificate no.')}</th>
                <th className="text-left font-bold px-3 py-3">{t('table.instrument', 'Instrument')}</th>
                <th className="text-left font-bold px-3 py-3">{t('table.type', 'Type')}</th>
                <th className="text-left font-bold px-3 py-3">{t('hub.issuedOn', 'Issued on')}</th>
                <th className="text-left font-bold px-3 py-3">{t('table.result', 'Result')}</th>
                <th className="text-right font-bold px-5 py-3">{t('hub.documents', 'Documents')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading && <tr><td colSpan={6} className="px-5 py-10 text-center text-slate-500">{t('common.loading', 'Loading…')}</td></tr>}
              {!isLoading && rows.length === 0 && <tr><td colSpan={6} className="px-5 py-12 text-center text-slate-500">{t('hub.none', 'No certificates match.')}</td></tr>}
              {rows.map((s) => (
                <tr key={s.id} className="hover:bg-primary-50/30">
                  <td className="px-5 py-3 font-mono text-[12.5px] font-semibold text-primary-700 whitespace-nowrap">{s.certificateNo}</td>
                  <td className="px-3 py-3">
                    <div className="font-semibold text-slate-800 truncate max-w-[280px]">{s.instrument?.name}</div>
                    <div className="text-[11px] text-slate-500">{s.conductedBy?.name}</div>
                  </td>
                  <td className="px-3 py-3 text-xs text-slate-600">{verificationTypeLabel(s.verificationType)}</td>
                  <td className="px-3 py-3 text-xs text-slate-600 whitespace-nowrap">{formatDate(s.completedAt)}</td>
                  <td className="px-3 py-3"><StatusBadge status={s.overallResult} size="xs" /></td>
                  <td className="px-5 py-3 text-right whitespace-nowrap">
                    <button type="button" disabled={busy === `${s.id}-certificate`} onClick={() => download(s, 'certificate')} className="inline-flex items-center gap-1 h-8 px-2.5 mr-1.5 rounded-md border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-white disabled:opacity-50">
                      <FiDownload className="w-3.5 h-3.5" /> {t('common.certificate', 'Certificate')}
                    </button>
                    <button type="button" disabled={busy === `${s.id}-datasheet`} onClick={() => download(s, 'datasheet')} className="inline-flex items-center gap-1 h-8 px-2.5 mr-1.5 rounded-md border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-white disabled:opacity-50">
                      <FiDownload className="w-3.5 h-3.5" /> {t('hub.datasheet', 'Data sheet')}
                    </button>
                    <button type="button" onClick={() => navigate(`/reports/${s.id}`)} className="inline-flex items-center gap-1 h-8 px-2.5 rounded-md bg-primary-50 text-primary-800 text-xs font-bold hover:bg-primary-100">
                      {t('hub.preview', 'Preview')} <FiArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
