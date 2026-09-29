import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { FiSave, FiSettings, FiCheckCircle, FiRefreshCw, FiDatabase, FiLock, FiSliders } from 'react-icons/fi';

import PageHeader from '../components/shared/PageHeader';
import apiClient from '../hooks/useApi';
import { DEFAULTS } from '../utils/settings';
import { verificationTypeLabel, VERIFICATION_TYPES } from '../utils/format';

const SETTINGS_STORAGE_KEY = 'nawi_settings';
const DEFAULT_SETTINGS = DEFAULTS;

const RULES = [
  ['Validity of verification', '12 months from the date of verification (Rule 27, LM (General) Rules, 2011)'],
  ['Re-verification reminder', '45 days before expiry — instrument flagged "Due for re-verification"'],
  ['MPE basis', 'OIML R 76-1:2006 Table 6; in-service inspection at 2 × MPE'],
  ['Certificate numbering', 'NAWI-YYYY-NNNNNN, sequential within the calendar year'],
  ['Digital seal', 'HMAC-SHA256 over certificate no., instrument, verdict date, officer, Max and e'],
];

export default function SettingsPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [resetting, setResetting] = useState(false);

  const [settings, setSettings] = useState(() => {
    try {
      const stored = localStorage.getItem(SETTINGS_STORAGE_KEY);
      if (stored) return { ...DEFAULT_SETTINGS, ...JSON.parse(stored) };
    } catch {
      /* corrupted JSON — fall back to defaults */
    }
    return DEFAULT_SETTINGS;
  });

  const set = (k) => (e) => {
    const v = e.target.type === 'checkbox' ? e.target.checked : e.target.type === 'number' ? Number(e.target.value) : e.target.value;
    setSettings((s) => ({ ...s, [k]: v }));
  };

  const handleSave = (e) => {
    e.preventDefault();
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
    toast.success(t('settings.saved', 'Preferences saved. They apply to new verification sessions.'));
  };

  const handleResetDefaults = () => {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(DEFAULT_SETTINGS));
    setSettings(DEFAULT_SETTINGS);
    toast.success(t('settings.resetDone', 'Preferences reset to defaults'));
  };

  const resetDemo = async () => {
    if (!window.confirm(t('settings.resetConfirm', 'Restore the original demonstration data? Sessions and instruments added during this demo will be removed.'))) return;
    setResetting(true);
    try {
      await apiClient.post('/dashboard/reset-demo');
      await qc.invalidateQueries();
      toast.success(t('settings.demoRestored', 'Demonstration data restored'));
    } catch (err) {
      toast.error(err.response?.data?.message || t('settings.demoFail', 'Could not reset demo data'));
    } finally {
      setResetting(false);
    }
  };

  const input = 'w-full h-10 px-3 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500/30';

  return (
    <div className="max-w-5xl">
      <PageHeader
        icon={FiSettings}
        eyebrow={t('users.eyebrow', 'Administration')}
        title={t('settings.title', 'Settings')}
        subtitle={t('settings.subtitle', 'Field defaults for this device, indicator connection and the statutory rules applied by the system.')}
      />

      <form onSubmit={handleSave} className="space-y-5">
        <section className="bg-white border border-slate-200 rounded-xl p-5">
          <h2 className="text-sm font-extrabold text-navy flex items-center gap-2"><FiSliders className="w-4 h-4" /> {t('settings.fieldDefaults', 'Field defaults for new sessions')}</h2>
          <p className="text-xs text-slate-500 mt-1 mb-4">{t('settings.fieldDefaultsSub', 'Pre-filled on “Start Verification”; the officer can still change them per session.')}</p>
          <div className="grid gap-4 sm:grid-cols-4">
            <label className="block sm:col-span-4 md:col-span-1">
              <span className="block text-[12.5px] font-bold text-slate-700 mb-1">{t('settings.vType', 'Verification type')}</span>
              <select className={input} value={settings.defaultVerificationType} onChange={set('defaultVerificationType')}>
                {Object.keys(VERIFICATION_TYPES).map((k) => <option key={k} value={k}>{verificationTypeLabel(k)}</option>)}
              </select>
            </label>
            <label className="block"><span className="block text-[12.5px] font-bold text-slate-700 mb-1">{t('newSess.temp', 'Ambient temperature (°C)')}</span><input type="number" step="0.1" className={input} value={settings.defaultTemperature} onChange={set('defaultTemperature')} /></label>
            <label className="block"><span className="block text-[12.5px] font-bold text-slate-700 mb-1">{t('newSess.rh', 'Relative humidity (% RH)')}</span><input type="number" step="1" className={input} value={settings.defaultHumidity} onChange={set('defaultHumidity')} /></label>
            <label className="block"><span className="block text-[12.5px] font-bold text-slate-700 mb-1">{t('newSess.pressure', 'Pressure (hPa)')}</span><input type="number" step="0.1" className={input} value={settings.defaultPressure} onChange={set('defaultPressure')} /></label>
          </div>
        </section>

        <section className="bg-white border border-slate-200 rounded-xl p-5">
          <h2 className="text-sm font-extrabold text-navy">{t('settings.indicator', 'Weighing indicator connection')}</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="block text-[12.5px] font-bold text-slate-700 mb-1">{t('settings.protocol', 'Default RS-232 protocol')}</span>
              <select className={input} value={settings.indicatorProtocol} onChange={set('indicatorProtocol')}>
                <option value="METTLER_SICS">Mettler-Toledo SICS</option>
                <option value="AVERY_WEIGH_TRONIX">Avery Weigh-Tronix</option>
                <option value="ESSAE">Essae-Teraoka</option>
              </select>
            </label>
            <label className="flex items-center gap-3 mt-6 text-sm text-slate-700">
              <input type="checkbox" className="w-4 h-4" checked={settings.autoConnectIndicator} onChange={set('autoConnectIndicator')} />
              {t('settings.autoConnect', 'Connect to the indicator automatically when recording readings')}
            </label>
          </div>
        </section>

        <div className="flex justify-end gap-2">
          <button type="button" onClick={handleResetDefaults} className="inline-flex items-center gap-2 h-10 px-4 rounded-md border border-slate-300 bg-white text-sm font-semibold text-slate-700 hover:bg-slate-50">
            <FiRefreshCw className="w-4 h-4" /> {t('settings.reset', 'Reset to defaults')}
          </button>
          <button type="submit" className="inline-flex items-center gap-2 h-10 px-5 rounded-md bg-navy text-white text-sm font-bold hover:bg-navy-light">
            <FiSave className="w-4 h-4" /> {t('settings.save', 'Save preferences')}
          </button>
        </div>
      </form>

      <section className="mt-6 bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100">
          <h2 className="text-sm font-extrabold text-navy flex items-center gap-2"><FiLock className="w-4 h-4" /> {t('settings.rules', 'Statutory rules enforced by the server')}</h2>
          <p className="text-xs text-slate-500 mt-1">{t('settings.rulesSub', 'Shown for transparency — these cannot be changed from the browser.')}</p>
        </div>
        <ul className="divide-y divide-slate-100">
          {RULES.map(([k, v]) => (
            <li key={k} className="px-5 py-3 flex gap-3 text-sm">
              <FiCheckCircle className="w-4 h-4 text-green-600 shrink-0 mt-0.5" />
              <span className="w-56 shrink-0 font-semibold text-slate-800">{k}</span>
              <span className="text-slate-600">{v}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-6 bg-white border border-amber-200 rounded-xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-sm font-extrabold text-navy flex items-center gap-2"><FiDatabase className="w-4 h-4" /> {t('settings.demoTitle', 'Demonstration data')}</h2>
          <p className="text-xs text-slate-600 mt-1 max-w-xl">{t('settings.demoText', 'Restore the original 16 instruments and 36 sessions — useful after a walkthrough. Available only while running on the in-memory demo database.')}</p>
        </div>
        <button type="button" onClick={resetDemo} disabled={resetting} className="inline-flex items-center gap-2 h-10 px-4 rounded-md border border-amber-400 bg-amber-50 text-sm font-bold text-amber-900 hover:bg-amber-100 disabled:opacity-60">
          <FiRefreshCw className={`w-4 h-4 ${resetting ? 'animate-spin' : ''}`} /> {t('settings.resetDemo', 'Reset demo data')}
        </button>
      </section>
    </div>
  );
}
