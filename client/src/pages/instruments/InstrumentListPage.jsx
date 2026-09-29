import React, { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { FiPlus, FiSearch, FiMapPin, FiArrowRight, FiPlayCircle, FiX, FiDownload } from 'react-icons/fi';
import { TbScale } from 'react-icons/tb';

import apiClient from '../../hooks/useApi';
import PageHeader from '../../components/shared/PageHeader';
import StatusBadge from '../../components/shared/StatusBadge';
import { useAuth } from '../../contexts/AuthContext';
import { classLabel, typeLabel, formatDate, instrumentPhoto, complianceLabel, formatMass, TYPE_LABELS, CLASS_LABELS } from '../../utils/format';

const STATUSES = ['VALID', 'DUE_SOON', 'EXPIRED', 'REJECTED', 'NOT_VERIFIED'];

export default function InstrumentListPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { isInspector } = useAuth();
  const [params, setParams] = useSearchParams();

  const [search, setSearch] = useState('');
  const [type, setType] = useState('');
  const [klass, setKlass] = useState('');
  const [district, setDistrict] = useState('');
  const compliance = params.get('compliance') || '';

  const { data: instruments = [], isLoading } = useQuery({
    queryKey: ['instruments'],
    queryFn: async () => (await apiClient.get('/instruments', { params: { limit: 200 } })).data?.data || [],
  });

  const districts = useMemo(() => [...new Set(instruments.map((i) => i.district).filter(Boolean))].sort(), [instruments]);
  const counts = useMemo(() => {
    const c = {};
    instruments.forEach((i) => {
      const s = i.compliance?.status || 'NOT_VERIFIED';
      c[s] = (c[s] || 0) + 1;
    });
    return c;
  }, [instruments]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return instruments.filter((i) => {
      if (q && ![i.name, i.model, i.serialNumber, i.manufacturer, i.location, i.ownerName, i.district].some((v) => v?.toLowerCase().includes(q))) return false;
      if (type && i.type !== type) return false;
      if (klass && i.accuracyClass !== klass) return false;
      if (district && i.district !== district) return false;
      if (compliance && (i.compliance?.status || 'NOT_VERIFIED') !== compliance) return false;
      return true;
    });
  }, [instruments, search, type, klass, district, compliance]);

  const setCompliance = (s) => {
    const next = new URLSearchParams(params);
    if (!s || s === compliance) next.delete('compliance');
    else next.set('compliance', s);
    setParams(next, { replace: true });
  };

  const exportCsv = () => {
    const head = ['Name', 'Type', 'Manufacturer', 'Model', 'Serial', 'Class', 'Max', 'e', 'Unit', 'Owner', 'Location', 'District', 'Status', 'Valid until', 'Last certificate'];
    const lines = rows.map((i) =>
      [i.name, TYPE_LABELS[i.type], i.manufacturer, i.model, i.serialNumber, CLASS_LABELS[i.accuracyClass], i.maxCapacity, i.verificationInterval, i.unit, i.ownerName, i.location, i.district, i.compliance?.status, i.compliance?.validUntil ? new Date(i.compliance.validUntil).toISOString().slice(0, 10) : '', i.compliance?.lastCertificateNo || '']
        .map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`)
        .join(',')
    );
    const blob = new Blob([[head.join(','), ...lines].join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `instrument-register-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  };

  const filtersActive = search || type || klass || district || compliance;
  const selectCls = 'h-10 px-3 text-sm bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500/30';

  return (
    <div>
      <PageHeader
        icon={TbScale}
        eyebrow={t('instr.eyebrow', 'Registry of weights & measures')}
        title={t('instr.title', 'Instrument Registry')}
        subtitle={t('instr.subtitle', 'Every non-automatic weighing instrument registered in your jurisdiction, with its current stamping status.')}
        actions={
          <>
            <button type="button" onClick={exportCsv} className="inline-flex items-center gap-2 h-10 px-4 rounded-md border border-slate-300 bg-white text-sm font-semibold text-slate-700 hover:bg-slate-50">
              <FiDownload className="w-4 h-4" /> {t('common.exportCsv', 'Export CSV')}
            </button>
            {isInspector && (
              <button type="button" onClick={() => navigate('/instruments/new')} className="inline-flex items-center gap-2 h-10 px-4 rounded-md bg-navy text-white text-sm font-bold hover:bg-navy-light">
                <FiPlus className="w-4 h-4" /> {t('instr.register', 'Register Instrument')}
              </button>
            )}
          </>
        }
      />

      {/* Status chips */}
      <div className="flex flex-wrap gap-2 mb-4">
        <button
          type="button"
          onClick={() => setCompliance('')}
          className={`h-9 px-3.5 rounded-full text-[13px] font-semibold border ${!compliance ? 'bg-navy text-white border-navy' : 'bg-white text-slate-700 border-slate-300 hover:border-navy'}`}
        >
          {t('common.all', 'All')} <span className="ml-1 opacity-70">{instruments.length}</span>
        </button>
        {STATUSES.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setCompliance(s)}
            className={`h-9 px-3.5 rounded-full text-[13px] font-semibold border ${compliance === s ? 'bg-navy text-white border-navy' : 'bg-white text-slate-700 border-slate-300 hover:border-navy'}`}
          >
            {complianceLabel(s)} <span className="ml-1 opacity-70">{counts[s] || 0}</span>
          </button>
        ))}
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-3 mb-4 flex flex-col lg:flex-row gap-2">
        <div className="relative flex-1">
          <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('instr.search', 'Search by name, serial no., owner, location…')}
            className="w-full h-10 pl-10 pr-3 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500/30"
          />
        </div>
        <select value={type} onChange={(e) => setType(e.target.value)} className={selectCls} aria-label="Instrument type">
          <option value="">{t('instr.allTypes', 'All types')}</option>
          {Object.keys(TYPE_LABELS).map((k) => <option key={k} value={k}>{typeLabel(k)}</option>)}
        </select>
        <select value={klass} onChange={(e) => setKlass(e.target.value)} className={selectCls} aria-label="Accuracy class">
          <option value="">{t('instr.allClasses', 'All accuracy classes')}</option>
          {Object.keys(CLASS_LABELS).map((k) => <option key={k} value={k}>{classLabel(k)}</option>)}
        </select>
        <select value={district} onChange={(e) => setDistrict(e.target.value)} className={selectCls} aria-label="District">
          <option value="">{t('instr.allDistricts', 'All districts')}</option>
          {districts.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
        {filtersActive && (
          <button
            type="button"
            onClick={() => {
              setSearch('');
              setType('');
              setKlass('');
              setDistrict('');
              setCompliance('');
            }}
            className="inline-flex items-center gap-1 h-10 px-3 text-sm font-semibold text-slate-600 hover:text-red-700"
          >
            <FiX className="w-4 h-4" /> {t('common.clear', 'Clear')}
          </button>
        )}
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100 text-xs text-slate-500">
          {t('instr.showing', 'Showing {{n}} of {{t}} instruments', { n: rows.length, t: instruments.length })}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
              <tr>
                <th className="text-left font-bold px-5 py-3">{t('table.instrument', 'Instrument')}</th>
                <th className="text-left font-bold px-3 py-3">{t('instr.classCap', 'Class · Capacity')}</th>
                <th className="text-left font-bold px-3 py-3">{t('instr.ownerLoc', 'Owner · Location')}</th>
                <th className="text-left font-bold px-3 py-3">{t('instr.stamping', 'Stamping status')}</th>
                <th className="text-right font-bold px-5 py-3">{t('common.actions', 'Actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading &&
                Array.from({ length: 5 }, (_, i) => (
                  <tr key={i}>
                    <td colSpan={5} className="px-5 py-4">
                      <div className="h-10 bg-slate-100 rounded animate-pulse" />
                    </td>
                  </tr>
                ))}
              {!isLoading && rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-12 text-center text-sm text-slate-500">
                    {t('instr.none', 'No instruments match these filters.')}
                  </td>
                </tr>
              )}
              {rows.map((i) => {
                const c = i.compliance || { status: 'NOT_VERIFIED' };
                return (
                  <tr key={i.id} className="hover:bg-primary-50/30 cursor-pointer" onClick={() => navigate(`/instruments/${i.id}`)}>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <img src={instrumentPhoto(i)} alt="" className="w-14 h-11 rounded-md object-cover border border-slate-200 shrink-0" loading="lazy" />
                        <div className="min-w-0">
                          <div className="font-bold text-slate-900 truncate max-w-[280px]">{i.name}</div>
                          <div className="text-[11.5px] text-slate-500">
                            {typeLabel(i.type)} · {i.manufacturer} {i.model}
                          </div>
                          <div className="text-[11px] font-mono text-slate-500">S/N {i.serialNumber}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      <div className="font-semibold text-slate-800">{classLabel(i.accuracyClass)}</div>
                      <div className="text-[11.5px] text-slate-500">
                        Max {formatMass(i.maxCapacity, { actualInterval: 1 })} {i.unit} · e = {i.verificationInterval} {i.unit}
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <div className="text-[13px] text-slate-800 truncate max-w-[240px]">{i.ownerName || '—'}</div>
                      <div className="text-[11.5px] text-slate-500 flex items-center gap-1 truncate max-w-[240px]">
                        <FiMapPin className="w-3 h-3 shrink-0" /> {i.district || i.location}
                      </div>
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      <StatusBadge status={c.status} size="xs" />
                      <div className="text-[11px] text-slate-500 mt-1">
                        {c.validUntil ? `${t('instr.validUntil', 'Valid until')} ${formatDate(c.validUntil)}` : c.lastVerifiedAt ? `${t('instr.lastTested', 'Tested')} ${formatDate(c.lastVerifiedAt)}` : c.inProgress ? t('dash.inProgress', 'verification in progress') : '—'}
                      </div>
                    </td>
                    <td className="px-5 py-3 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                      {isInspector && (
                        <button
                          type="button"
                          onClick={() => navigate(`/tests/new?instrumentId=${i.id}`)}
                          className="inline-flex items-center gap-1 h-8 px-2.5 mr-1.5 rounded-md border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                          title={t('instr.startTest', 'Start verification')}
                        >
                          <FiPlayCircle className="w-3.5 h-3.5" /> {t('instr.verify', 'Verify')}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => navigate(`/instruments/${i.id}`)}
                        className="inline-flex items-center gap-1 h-8 px-2.5 rounded-md bg-primary-50 text-primary-800 text-xs font-bold hover:bg-primary-100"
                      >
                        {t('common.open', 'Open')} <FiArrowRight className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
