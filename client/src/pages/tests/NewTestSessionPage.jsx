import React, { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { FiPlayCircle, FiSearch, FiCheck, FiThermometer, FiDroplet, FiWind, FiAlertTriangle, FiMapPin } from 'react-icons/fi';

import apiClient from '../../hooks/useApi';
import PageHeader from '../../components/shared/PageHeader';
import StatusBadge from '../../components/shared/StatusBadge';
import { classLabel, typeLabel, instrumentPhoto, formatDate } from '../../utils/format';
import { getSettings } from '../../utils/settings';

const STANDARD_SETS = {
  WEIGHBRIDGE: 'M1 cast-iron standard weights (20 × 500 kg) + test vehicle, set SW-PB-WB-03; RRSL Faridabad cert. RRSL/F/2025/4417',
  PLATFORM_SCALE: 'M1 standard weights set SW-PB-M1-11 (1 kg – 20 kg); RRSL Faridabad cert. RRSL/F/2025/3982',
  ELECTRONIC_SCALE: 'F2 standard weights set SW-PB-F2-06 (1 g – 10 kg); RRSL Faridabad cert. RRSL/F/2025/3875',
  LABORATORY_BALANCE: 'E2 reference weights set SW-PB-E2-01 (1 mg – 200 g); NPL New Delhi cert. NPL/MASS/2025/0219',
};

const TYPES = [
  { k: 'INITIAL', title: 'Initial verification', desc: 'New or repaired instrument before first use in trade. MPE = 1 × Table 6.' },
  { k: 'PERIODIC', title: 'Periodic re-verification', desc: 'Annual re-verification of a stamped instrument (Rule 27). MPE = 1 × Table 6.' },
  { k: 'INSPECTION', title: 'In-service inspection', desc: 'Surprise check of an instrument in use (Section 15). MPE = 2 × Table 6.' },
];

export default function NewTestSessionPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [params] = useSearchParams();

  const [instrumentId, setInstrumentId] = useState(params.get('instrumentId') || '');
  const [search, setSearch] = useState('');
  const prefs = useMemo(() => getSettings(), []);
  const [vType, setVType] = useState(prefs.defaultVerificationType);
  const [temp, setTemp] = useState(String(prefs.defaultTemperature));
  const [rh, setRh] = useState(String(prefs.defaultHumidity));
  const [pressure, setPressure] = useState(String(prefs.defaultPressure));
  const [weights, setWeights] = useState('');
  const [remarks, setRemarks] = useState('');
  const [busy, setBusy] = useState(false);

  const { data: instruments = [] } = useQuery({
    queryKey: ['instruments'],
    queryFn: async () => (await apiClient.get('/instruments', { params: { limit: 200 } })).data?.data || [],
  });

  const selected = instruments.find((i) => i.id === instrumentId);
  const list = useMemo(() => {
    const q = search.trim().toLowerCase();
    return instruments.filter((i) => !q || [i.name, i.serialNumber, i.district, i.ownerName].some((v) => v?.toLowerCase().includes(q)));
  }, [instruments, search]);

  const warnings = [];
  const tNum = Number(temp);
  if (temp !== '' && (tNum < 10 || tNum > 40)) warnings.push(t('newSess.tempWarn', 'Temperature is outside the usual −10 °C … +40 °C operating range — record the reason in remarks.'));
  if (rh !== '' && Number(rh) > 85) warnings.push(t('newSess.rhWarn', 'Humidity above 85 % RH may affect load-cell readings.'));

  const submit = async () => {
    if (!instrumentId) {
      toast.error(t('newSess.pickInstrument', 'Select the instrument to be verified.'));
      return;
    }
    setBusy(true);
    try {
      const res = await apiClient.post('/tests', {
        instrumentId,
        verificationType: vType,
        temperature: temp === '' ? undefined : Number(temp),
        humidity: rh === '' ? undefined : Number(rh),
        atmosphericPressure: pressure === '' ? undefined : Number(pressure),
        standardWeightsUsed: weights || STANDARD_SETS[selected?.type] || '',
        remarks: remarks || undefined,
      });
      const s = res.data?.data;
      queryClient.invalidateQueries();
      toast.success(t('newSess.created', 'Session {{n}} opened. Record the six OIML R 76 tests.', { n: s?.certificateNo }));
      navigate(`/tests/${s.id}`);
    } catch (err) {
      toast.error(err.response?.data?.message || err.response?.data?.errors?.[0]?.msg || t('newSess.fail', 'Could not open the session'));
    } finally {
      setBusy(false);
    }
  };

  const input = 'w-full h-10 px-3 text-sm bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500/30';

  return (
    <div className="max-w-6xl">
      <PageHeader
        icon={FiPlayCircle}
        eyebrow={t('sessions.eyebrow', 'OIML R 76 test records')}
        title={t('newSess.title', 'Start a verification')}
        subtitle={t('newSess.subtitle', 'Select the instrument, the kind of verification and the test conditions. A certificate number is reserved immediately.')}
      />

      <div className="grid gap-5 lg:grid-cols-[1fr_360px] items-start">
        <div className="space-y-5">
          {/* Step 1 */}
          <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between gap-3">
              <h2 className="text-sm font-extrabold text-navy">1. {t('newSess.step1', 'Instrument under test')}</h2>
              <div className="relative w-64 max-w-full">
                <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('newSess.search', 'Search name, serial, district')} className="w-full h-9 pl-9 pr-3 text-sm border border-slate-300 rounded-md" />
              </div>
            </div>
            <ul className="max-h-[360px] overflow-y-auto divide-y divide-slate-100">
              {list.map((i) => {
                const active = i.id === instrumentId;
                return (
                  <li key={i.id}>
                    <button
                      type="button"
                      onClick={() => setInstrumentId(i.id)}
                      className={`w-full text-left px-5 py-3 flex items-center gap-3 ${active ? 'bg-primary-50 ring-2 ring-inset ring-primary-500' : 'hover:bg-slate-50'}`}
                    >
                      <img src={instrumentPhoto(i)} alt="" className="w-12 h-10 rounded object-cover border border-slate-200" />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-bold text-slate-900 truncate">{i.name}</span>
                        <span className="block text-[11.5px] text-slate-500 truncate">
                          {typeLabel(i.type)} · {classLabel(i.accuracyClass)} · Max {i.maxCapacity} {i.unit} · <span className="font-mono">{i.serialNumber}</span>
                        </span>
                      </span>
                      <StatusBadge status={i.compliance?.status} size="xs" />
                      <span className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${active ? 'bg-primary-600 border-primary-600 text-white' : 'border-slate-300'}`}>
                        {active && <FiCheck className="w-3 h-3" />}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>

          {/* Step 2 */}
          <section className="bg-white border border-slate-200 rounded-xl p-5">
            <h2 className="text-sm font-extrabold text-navy mb-3">2. {t('newSess.step2', 'Type of verification')}</h2>
            <div className="grid gap-3 md:grid-cols-3">
              {TYPES.map((ty) => (
                <button
                  key={ty.k}
                  type="button"
                  onClick={() => setVType(ty.k)}
                  className={`text-left p-4 rounded-lg border-2 transition-colors ${vType === ty.k ? 'border-primary-600 bg-primary-50' : 'border-slate-200 hover:border-slate-300'}`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold text-slate-900">{t(`verificationType.${ty.k}`, ty.title)}</span>
                    {vType === ty.k && <FiCheck className="w-4 h-4 text-primary-700" />}
                  </div>
                  <p className="text-[12px] text-slate-600 mt-1.5 leading-snug">{t(`newSess.desc${ty.k}`, ty.desc)}</p>
                </button>
              ))}
            </div>
          </section>

          {/* Step 3 */}
          <section className="bg-white border border-slate-200 rounded-xl p-5">
            <h2 className="text-sm font-extrabold text-navy mb-3">3. {t('newSess.step3', 'Test conditions & standards')}</h2>
            <div className="grid gap-4 sm:grid-cols-3">
              <label className="block">
                <span className="flex items-center gap-1.5 text-[12.5px] font-bold text-slate-700 mb-1.5"><FiThermometer className="w-3.5 h-3.5" /> {t('newSess.temp', 'Ambient temperature (°C)')}</span>
                <input type="number" step="0.1" value={temp} onChange={(e) => setTemp(e.target.value)} className={input} />
              </label>
              <label className="block">
                <span className="flex items-center gap-1.5 text-[12.5px] font-bold text-slate-700 mb-1.5"><FiDroplet className="w-3.5 h-3.5" /> {t('newSess.rh', 'Relative humidity (% RH)')}</span>
                <input type="number" step="1" value={rh} onChange={(e) => setRh(e.target.value)} className={input} />
              </label>
              <label className="block">
                <span className="flex items-center gap-1.5 text-[12.5px] font-bold text-slate-700 mb-1.5"><FiWind className="w-3.5 h-3.5" /> {t('newSess.pressure', 'Pressure (hPa)')}</span>
                <input type="number" step="0.1" value={pressure} onChange={(e) => setPressure(e.target.value)} className={input} />
              </label>
              <label className="block sm:col-span-3">
                <span className="block text-[12.5px] font-bold text-slate-700 mb-1.5">{t('newSess.weights', 'Reference standards used')}</span>
                <input value={weights} onChange={(e) => setWeights(e.target.value)} placeholder={STANDARD_SETS[selected?.type] || t('newSess.weightsPh', 'Standard weight set and its calibration certificate')} className={input} />
                <span className="block text-[11.5px] text-slate-500 mt-1">{t('newSess.weightsHint', 'Leave blank to use the district’s standard set for this category (shown above).')}</span>
              </label>
              <label className="block sm:col-span-3">
                <span className="block text-[12.5px] font-bold text-slate-700 mb-1.5">{t('newSess.remarks', 'Initial observations (optional)')}</span>
                <textarea rows={2} value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder={t('newSess.remarksPh', 'e.g. Levelling bubble centred, seals intact, 30 min warm-up done')} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md" />
              </label>
            </div>
            {warnings.map((w) => (
              <div key={w} className="mt-3 p-3 rounded-md bg-amber-50 border border-amber-200 text-xs text-amber-800 flex gap-2">
                <FiAlertTriangle className="w-4 h-4 shrink-0" /> {w}
              </div>
            ))}
          </section>
        </div>

        {/* Summary */}
        <aside className="bg-white border border-slate-200 rounded-xl overflow-hidden lg:sticky lg:top-[124px]">
          <div className="px-5 py-3 bg-navy text-white">
            <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-saffron-500">{t('newSess.summary', 'Session summary')}</div>
            <div className="text-sm font-bold">{t('newSess.summarySub', 'Review before opening')}</div>
          </div>
          {selected ? (
            <div>
              <img src={instrumentPhoto(selected)} alt="" className="w-full h-36 object-cover" />
              <div className="p-5 space-y-3 text-sm">
                <div>
                  <div className="font-bold text-slate-900">{selected.name}</div>
                  <div className="text-xs text-slate-500 flex items-center gap-1 mt-0.5"><FiMapPin className="w-3 h-3" /> {selected.location}</div>
                </div>
                <dl className="grid grid-cols-2 gap-2 text-xs">
                  <div className="p-2 rounded bg-slate-50"><dt className="text-slate-500">{t('table.classShort', 'Class')}</dt><dd className="font-bold">{classLabel(selected.accuracyClass)}</dd></div>
                  <div className="p-2 rounded bg-slate-50"><dt className="text-slate-500">Max / e</dt><dd className="font-bold">{selected.maxCapacity} / {selected.verificationInterval} {selected.unit}</dd></div>
                  <div className="p-2 rounded bg-slate-50 col-span-2"><dt className="text-slate-500">{t('newSess.lastCert', 'Last certificate')}</dt><dd className="font-bold">{selected.compliance?.lastCertificateNo ? `${selected.compliance.lastCertificateNo} · ${formatDate(selected.compliance.lastVerifiedAt)}` : '—'}</dd></div>
                </dl>
                {selected.compliance?.inProgress && (
                  <div className="p-2.5 rounded bg-amber-50 border border-amber-200 text-[11.5px] text-amber-800">{t('newSess.openWarn', 'This instrument already has a session in progress.')}</div>
                )}
                <div className="text-xs text-slate-600">
                  <b>{t(`verificationType.${vType}`, TYPES.find((x) => x.k === vType).title)}</b> · {temp} °C · {rh} % RH
                </div>
              </div>
            </div>
          ) : (
            <div className="p-6 text-sm text-slate-500">{t('newSess.noneSelected', 'Select an instrument from the list to continue.')}</div>
          )}
          <div className="p-4 border-t border-slate-100">
            <button type="button" onClick={submit} disabled={busy || !instrumentId} className="w-full h-11 inline-flex items-center justify-center gap-2 rounded-md bg-saffron-500 hover:bg-saffron-600 text-navy-dark font-extrabold text-sm disabled:opacity-50">
              <FiPlayCircle className="w-4 h-4" /> {busy ? t('common.saving', 'Saving…') : t('newSess.open', 'Open verification session')}
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
}
