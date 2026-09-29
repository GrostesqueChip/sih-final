import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { FiSave, FiX, FiCheckCircle, FiAlertTriangle, FiZap } from 'react-icons/fi';
import { TbScale } from 'react-icons/tb';

import apiClient from '../../hooks/useApi';
import PageHeader from '../../components/shared/PageHeader';
import LoadingSpinner from '../../components/shared/LoadingSpinner';
import { MPE_TIERS } from '../../utils/metrology';
import { classLabel, typeLabel, TYPE_LABELS, CLASS_LABELS, CLASS_DESC } from '../../utils/format';

const DISTRICTS = [
  'Amritsar', 'Barnala', 'Bathinda', 'Chandigarh (UT)', 'Faridkot', 'Fatehgarh Sahib', 'Fazilka', 'Ferozepur', 'Gurdaspur', 'Hoshiarpur',
  'Jalandhar', 'Kapurthala', 'Ludhiana', 'Malerkotla', 'Mansa', 'Moga', 'Pathankot', 'Patiala', 'Rupnagar', 'S.A.S. Nagar', 'Sangrur',
  'Shaheed Bhagat Singh Nagar', 'Sri Muktsar Sahib', 'Tarn Taran',
];

// OIML R 76-1 Table 3 — classification rules (e in grams).
function classRules(accuracyClass, eGrams) {
  switch (accuracyClass) {
    case 'CLASS_I':
      return { nMin: 50000, nMax: Infinity, minE: 100 };
    case 'CLASS_II':
      return eGrams >= 0.1 ? { nMin: 5000, nMax: 100000, minE: 50 } : { nMin: 100, nMax: 100000, minE: 20 };
    case 'CLASS_III':
      return eGrams >= 5 ? { nMin: 500, nMax: 10000, minE: 20 } : { nMin: 100, nMax: 10000, minE: 20 };
    case 'CLASS_IIII':
      return { nMin: 100, nMax: 1000, minE: 10 };
    default:
      return null;
  }
}

const EMPTY = {
  name: '',
  type: 'PLATFORM_SCALE',
  manufacturer: '',
  model: '',
  serialNumber: '',
  accuracyClass: 'CLASS_III',
  unit: 'kg',
  maxCapacity: '',
  minCapacity: '',
  verificationInterval: '',
  actualInterval: '',
  ownerName: '',
  district: '',
  location: '',
};

const EXAMPLE = {
  name: 'Sirhind Grain Market Platform Scale',
  type: 'PLATFORM_SCALE',
  manufacturer: 'Essae-Teraoka Pvt Ltd',
  model: 'DS-452 Platform',
  serialNumber: `ESS-2026-FGS-${Math.floor(1000 + Math.random() * 8999)}`,
  accuracyClass: 'CLASS_III',
  unit: 'kg',
  maxCapacity: '300',
  minCapacity: '2',
  verificationInterval: '0.1',
  actualInterval: '0.1',
  ownerName: 'M/s Guru Kripa Traders',
  district: 'Fatehgarh Sahib',
  location: 'Shop No. 21, New Grain Market, Sirhind',
};

function Field({ label, error, hint, children, required, span = '' }) {
  return (
    <div className={span}>
      <label className="block text-[12.5px] font-bold text-slate-700 mb-1.5">
        {label} {required && <span className="text-red-600">*</span>}
      </label>
      {children}
      {error ? <p className="mt-1 text-xs text-red-600">{error}</p> : hint ? <p className="mt-1 text-[11.5px] text-slate-500">{hint}</p> : null}
    </div>
  );
}

export default function InstrumentFormPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { id } = useParams();
  const isEdit = Boolean(id);

  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isEdit) return;
    apiClient
      .get(`/instruments/${id}`)
      .then((res) => {
        const inst = res.data?.data || {};
        setForm(Object.fromEntries(Object.keys(EMPTY).map((k) => [k, inst[k] == null ? '' : String(inst[k])])));
      })
      .catch(() => {
        toast.error(t('instr.loadFail', 'Could not load the instrument.'));
        navigate('/instruments');
      })
      .finally(() => setLoading(false));
  }, [id, isEdit, navigate, t]);

  const set = (k) => (e) => {
    setForm((f) => ({ ...f, [k]: e.target.value }));
    setErrors((er) => ({ ...er, [k]: null }));
  };

  // Live metrological checks
  const check = useMemo(() => {
    const max = Number(form.maxCapacity);
    const min = Number(form.minCapacity);
    const e = Number(form.verificationInterval);
    const d = Number(form.actualInterval);
    if (!(max > 0 && e > 0)) return null;
    const toGrams = form.unit === 'kg' ? 1000 : form.unit === 'mg' ? 0.001 : form.unit === 't' ? 1e6 : 1;
    const n = Math.round(max / e);
    const rules = classRules(form.accuracyClass, e * toGrams);
    const items = [];
    if (rules) {
      items.push({
        ok: n >= rules.nMin && n <= rules.nMax,
        text: t('form.nCheck', 'n = Max / e = {{n}} (allowed {{a}} – {{b}} for {{c}})', {
          n: n.toLocaleString('en-IN'),
          a: rules.nMin.toLocaleString('en-IN'),
          b: rules.nMax === Infinity ? '∞' : rules.nMax.toLocaleString('en-IN'),
          c: classLabel(form.accuracyClass),
        }),
      });
      if (min > 0) {
        items.push({
          ok: min >= rules.minE * e - 1e-9,
          text: t('form.minCheck', 'Min ≥ {{k}} e = {{v}} {{u}}', { k: rules.minE, v: +(rules.minE * e).toFixed(6), u: form.unit }),
        });
      }
    }
    if (d > 0) items.push({ ok: d <= e + 1e-12, text: t('form.dCheck', 'd ≤ e (actual interval not coarser than verification interval)') });
    const tiers = (MPE_TIERS[form.accuracyClass] || []).filter((tier) => tier.minLoad < n);
    return { n, items, tiers, e };
  }, [form, t]);

  const validate = () => {
    const er = {};
    ['name', 'manufacturer', 'model', 'serialNumber', 'location'].forEach((k) => {
      if (!String(form[k]).trim()) er[k] = t('form.required', 'Required');
    });
    const max = Number(form.maxCapacity);
    const min = Number(form.minCapacity);
    if (!(max > 0)) er.maxCapacity = t('form.positive', 'Enter a positive number');
    if (!(min >= 0) || form.minCapacity === '') er.minCapacity = t('form.positive', 'Enter a positive number');
    else if (min >= max) er.minCapacity = t('form.minLtMax', 'Min must be less than Max');
    if (!(Number(form.verificationInterval) > 0)) er.verificationInterval = t('form.positive', 'Enter a positive number');
    if (!(Number(form.actualInterval) > 0)) er.actualInterval = t('form.positive', 'Enter a positive number');
    setErrors(er);
    return Object.keys(er).length === 0;
  };

  const onSubmit = async (ev) => {
    ev.preventDefault();
    if (!validate()) {
      toast.error(t('form.fixErrors', 'Please correct the highlighted fields.'));
      return;
    }
    setSaving(true);
    const payload = {
      ...form,
      maxCapacity: Number(form.maxCapacity),
      minCapacity: Number(form.minCapacity),
      verificationInterval: Number(form.verificationInterval),
      actualInterval: Number(form.actualInterval),
    };
    try {
      const res = isEdit ? await apiClient.put(`/instruments/${id}`, payload) : await apiClient.post('/instruments', payload);
      const saved = res.data?.data;
      queryClient.invalidateQueries({ queryKey: ['instruments'] });
      queryClient.invalidateQueries({ queryKey: ['instrument', id] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
      toast.success(isEdit ? t('form.updated', 'Instrument details updated') : t('form.created', 'Instrument registered in the registry'));
      navigate(`/instruments/${saved?.id || id}`);
    } catch (err) {
      const msg = err.response?.data?.message || err.response?.data?.errors?.[0]?.msg || t('form.saveFail', 'Could not save the instrument');
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <LoadingSpinner message={t('common.loading', 'Loading…')} />;

  const input = (k) =>
    `w-full h-10 px-3 text-sm bg-white border rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500/30 ${errors[k] ? 'border-red-400' : 'border-slate-300'}`;

  return (
    <div className="max-w-6xl">
      <PageHeader
        icon={TbScale}
        eyebrow={t('instr.eyebrow', 'Registry of weights & measures')}
        title={isEdit ? t('form.editTitle', 'Edit instrument') : t('form.newTitle', 'Register a weighing instrument')}
        subtitle={t('form.subtitle', 'Identification and metrological characteristics as marked on the data plate (OIML R 76-1, clause 7.1).')}
        actions={
          !isEdit && (
            <button type="button" onClick={() => setForm({ ...EXAMPLE, serialNumber: `ESS-2026-FGS-${Math.floor(1000 + Math.random() * 8999)}` })} className="inline-flex items-center gap-2 h-10 px-4 rounded-md border border-dashed border-saffron-500 bg-saffron-50 text-sm font-bold text-saffron-700 hover:bg-saffron-100">
              <FiZap className="w-4 h-4" /> {t('form.example', 'Fill example data')}
            </button>
          )
        }
      />

      <form onSubmit={onSubmit} className="grid gap-5 lg:grid-cols-[1fr_340px] items-start" noValidate>
        <div className="space-y-5">
          <section className="bg-white border border-slate-200 rounded-xl p-5">
            <h2 className="text-sm font-extrabold text-navy mb-4">1. {t('form.identification', 'Identification')}</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t('form.name', 'Instrument name')} error={errors.name} required span="sm:col-span-2">
                <input className={input('name')} value={form.name} onChange={set('name')} placeholder="e.g. Khanna Grain Market Weighbridge No. 2" />
              </Field>
              <Field label={t('form.type', 'Category')} required>
                <select className={input('type')} value={form.type} onChange={set('type')}>
                  {Object.keys(TYPE_LABELS).map((k) => <option key={k} value={k}>{typeLabel(k)}</option>)}
                </select>
              </Field>
              <Field label={t('form.serial', 'Serial number')} error={errors.serialNumber} required>
                <input className={`${input('serialNumber')} font-mono`} value={form.serialNumber} onChange={set('serialNumber')} placeholder="e.g. AVY-2026-KHN-0520" />
              </Field>
              <Field label={t('form.manufacturer', 'Manufacturer')} error={errors.manufacturer} required>
                <input className={input('manufacturer')} value={form.manufacturer} onChange={set('manufacturer')} placeholder="e.g. Avery India Ltd" />
              </Field>
              <Field label={t('form.model', 'Model / type designation')} error={errors.model} required>
                <input className={input('model')} value={form.model} onChange={set('model')} placeholder="e.g. Weigh-Tronix E1205" />
              </Field>
            </div>
          </section>

          <section className="bg-white border border-slate-200 rounded-xl p-5">
            <h2 className="text-sm font-extrabold text-navy mb-4">2. {t('form.metrology', 'Metrological characteristics')}</h2>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label={t('form.class', 'Accuracy class')} required span="sm:col-span-2">
                <select className={input('accuracyClass')} value={form.accuracyClass} onChange={set('accuracyClass')}>
                  {Object.keys(CLASS_LABELS).map((k) => <option key={k} value={k}>{classLabel(k)} — {CLASS_DESC[k]}</option>)}
                </select>
              </Field>
              <Field label={t('form.unit', 'Unit')} required>
                <select className={input('unit')} value={form.unit} onChange={set('unit')}>
                  <option value="kg">kg</option>
                  <option value="g">g</option>
                  <option value="mg">mg</option>
                </select>
              </Field>
              <Field label={`${t('form.max', 'Maximum capacity (Max)')} [${form.unit}]`} error={errors.maxCapacity} required>
                <input className={input('maxCapacity')} type="number" step="any" value={form.maxCapacity} onChange={set('maxCapacity')} placeholder="e.g. 300" />
              </Field>
              <Field label={`${t('form.min', 'Minimum capacity (Min)')} [${form.unit}]`} error={errors.minCapacity} required>
                <input className={input('minCapacity')} type="number" step="any" value={form.minCapacity} onChange={set('minCapacity')} placeholder="e.g. 2" />
              </Field>
              <div />
              <Field label={`${t('form.e', 'Verification interval e')} [${form.unit}]`} error={errors.verificationInterval} required>
                <input className={input('verificationInterval')} type="number" step="any" value={form.verificationInterval} onChange={set('verificationInterval')} placeholder="e.g. 0.1" />
              </Field>
              <Field label={`${t('form.d', 'Actual interval d')} [${form.unit}]`} error={errors.actualInterval} required hint={t('form.dHint', 'Usually d = e for trade scales')}>
                <input className={input('actualInterval')} type="number" step="any" value={form.actualInterval} onChange={set('actualInterval')} placeholder="e.g. 0.1" />
              </Field>
            </div>
          </section>

          <section className="bg-white border border-slate-200 rounded-xl p-5">
            <h2 className="text-sm font-extrabold text-navy mb-4">3. {t('form.ownerSection', 'Owner & place of use')}</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t('form.owner', 'Owner / user (trader, firm or department)')} span="sm:col-span-2">
                <input className={input('ownerName')} value={form.ownerName} onChange={set('ownerName')} placeholder="e.g. M/s Shiv Shakti Traders" />
              </Field>
              <Field label={t('form.district', 'District')}>
                <select className={input('district')} value={form.district} onChange={set('district')}>
                  <option value="">{t('form.selectDistrict', 'Select district')}</option>
                  {DISTRICTS.map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
              </Field>
              <Field label={t('form.location', 'Premises / address')} error={errors.location} required>
                <input className={input('location')} value={form.location} onChange={set('location')} placeholder="e.g. Shed 4, New Grain Market" />
              </Field>
            </div>
          </section>

          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => navigate(isEdit ? `/instruments/${id}` : '/instruments')} className="inline-flex items-center gap-2 h-11 px-5 rounded-md border border-slate-300 bg-white text-sm font-semibold text-slate-700 hover:bg-slate-50">
              <FiX className="w-4 h-4" /> {t('common.cancel', 'Cancel')}
            </button>
            <button type="submit" disabled={saving} className="inline-flex items-center gap-2 h-11 px-6 rounded-md bg-navy text-white text-sm font-bold hover:bg-navy-light disabled:opacity-60">
              <FiSave className="w-4 h-4" /> {saving ? t('common.saving', 'Saving…') : isEdit ? t('form.saveChanges', 'Save changes') : t('form.register', 'Register instrument')}
            </button>
          </div>
        </div>

        {/* Live check panel */}
        <aside className="bg-white border border-slate-200 rounded-xl overflow-hidden lg:sticky lg:top-[124px]">
          <div className="px-5 py-3 bg-navy text-white">
            <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-saffron-500">{t('form.liveCheck', 'Live OIML R 76 check')}</div>
            <div className="text-sm font-bold">{t('form.liveCheckSub', 'Classification & MPE preview')}</div>
          </div>
          <div className="p-5 text-sm">
            {!check ? (
              <p className="text-slate-500 text-[13px]">{t('form.liveEmpty', 'Enter Max and e to see the number of intervals, class conformity and the maximum permissible errors.')}</p>
            ) : (
              <>
                <ul className="space-y-2.5">
                  {check.items.map((it, i) => (
                    <li key={i} className="flex gap-2 text-[13px]">
                      {it.ok ? <FiCheckCircle className="w-4 h-4 text-green-600 shrink-0 mt-0.5" /> : <FiAlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />}
                      <span className={it.ok ? 'text-slate-700' : 'text-amber-800 font-semibold'}>{it.text}</span>
                    </li>
                  ))}
                </ul>
                <div className="mt-5 text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-2">{t('form.mpePreview', 'MPE at initial verification')}</div>
                <table className="w-full text-[12.5px]">
                  <tbody className="divide-y divide-slate-100">
                    {check.tiers.map((tier) => (
                      <tr key={tier.stepName}>
                        <td className="py-1.5 text-slate-600 font-mono">≤ {+(Math.min(tier.maxLoad, check.n) * check.e).toFixed(6)} {form.unit}</td>
                        <td className="py-1.5 text-right font-bold text-slate-900">± {+(tier.mpeInitial * check.e).toFixed(6)} {form.unit}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
          </div>
        </aside>
      </form>
    </div>
  );
}
