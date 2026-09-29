import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { FiArrowLeft, FiHome, FiSearch } from 'react-icons/fi';
import StateEmblem, { TricolorBar } from '../components/common/StateEmblem';
import { GovStrip } from '../components/layout/TopBar';

export default function NotFoundPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  return (
    <div className="min-h-screen flex flex-col bg-[#F3F6FA]">
      <GovStrip />
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm max-w-lg w-full overflow-hidden text-center">
          <TricolorBar thickness={3} />
          <div className="p-8">
            <StateEmblem height={72} />
            <div className="mt-4 text-5xl font-extrabold text-navy">404</div>
            <h1 className="mt-1 text-lg font-bold text-slate-900">{t('nf.title', 'Page not found')} <span className="font-hindi text-slate-400 font-semibold">/ पृष्ठ नहीं मिला</span></h1>
            <p className="mt-2 text-sm text-slate-600">{t('nf.text', 'The page you asked for does not exist or has moved.')}</p>
            <code className="mt-3 inline-block px-3 py-1.5 rounded bg-slate-100 text-xs text-slate-700">{pathname}</code>
            <div className="mt-6 flex flex-wrap justify-center gap-2">
              <button type="button" onClick={() => navigate(-1)} className="inline-flex items-center gap-2 h-10 px-4 rounded-md border border-slate-300 text-sm font-semibold text-slate-700 hover:bg-slate-50"><FiArrowLeft className="w-4 h-4" /> {t('nf.back', 'Go back')}</button>
              <button type="button" onClick={() => navigate('/dashboard')} className="inline-flex items-center gap-2 h-10 px-4 rounded-md bg-navy text-white text-sm font-bold"><FiHome className="w-4 h-4" /> {t('nav.dashboard', 'Dashboard')}</button>
              <button type="button" onClick={() => navigate('/verify')} className="inline-flex items-center gap-2 h-10 px-4 rounded-md border border-slate-300 text-sm font-semibold text-slate-700 hover:bg-slate-50"><FiSearch className="w-4 h-4" /> {t('nf.verify', 'Verify a certificate')}</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
