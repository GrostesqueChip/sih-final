import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { FiLock, FiHome } from 'react-icons/fi';
import { useAuth } from '../contexts/AuthContext';
import { ROLE_LABELS } from '../utils/format';

export default function AccessDeniedPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuth();
  return (
    <div className="flex items-center justify-center py-16">
      <div className="max-w-md w-full bg-white rounded-xl border border-slate-200 p-8 text-center">
        <span className="mx-auto w-14 h-14 bg-red-50 text-red-600 rounded-full flex items-center justify-center">
          <FiLock className="w-7 h-7" aria-hidden="true" />
        </span>
        <h1 className="mt-4 text-xl font-extrabold text-navy">{t('denied.title', 'Access restricted')}</h1>
        <p className="mt-1 text-sm text-slate-600">{t('denied.text', 'This section is available only to authorised roles.')}</p>
        {user && (
          <div className="mt-4 p-3 rounded-lg bg-slate-50 border border-slate-200 text-sm">
            {t('denied.role', 'Signed in as')} <b>{user.name}</b> · {t(`roles.${user.role}`, ROLE_LABELS[user.role] || user.role)}
          </div>
        )}
        <button type="button" onClick={() => navigate('/dashboard')} className="mt-5 inline-flex items-center gap-2 h-10 px-5 rounded-md bg-navy text-white text-sm font-bold">
          <FiHome className="w-4 h-4" /> {t('denied.back', 'Return to dashboard')}
        </button>
      </div>
    </div>
  );
}
