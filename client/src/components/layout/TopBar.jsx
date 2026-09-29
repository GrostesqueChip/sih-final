import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  FiBell,
  FiChevronDown,
  FiLogOut,
  FiMenu,
  FiWifi,
  FiWifiOff,
  FiRefreshCw,
  FiAlertTriangle,
  FiClock,
  FiXCircle,
  FiEdit3,
  FiExternalLink,
  FiCheckCircle,
  FiUser,
} from 'react-icons/fi';
import { useAuth } from '../../contexts/AuthContext';
import { useOfflineSync } from '../../hooks/useOfflineSync';
import apiClient from '../../hooks/useApi';
import StateEmblem, { TricolorBar } from '../common/StateEmblem';
import { initials, ROLE_LABELS, formatDate } from '../../utils/format';

function useClickOutside(ref, onClose) {
  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [ref, onClose]);
}

/** Thin Government of India utility strip (GIGW): skip link, text size, contrast, language. */
export function GovStrip() {
  const { t, i18n } = useTranslation();
  const [fontSize, setFontSize] = useState(() => localStorage.getItem('gigw_font_size') || 'base');
  const [highContrast, setHighContrast] = useState(() => localStorage.getItem('gigw_high_contrast') === 'true');

  useEffect(() => {
    const sizes = { sm: '14px', base: '16px', lg: '18px' };
    document.documentElement.style.fontSize = sizes[fontSize] || '16px';
    localStorage.setItem('gigw_font_size', fontSize);
  }, [fontSize]);

  useEffect(() => {
    document.documentElement.classList.toggle('high-contrast', highContrast);
    localStorage.setItem('gigw_high_contrast', String(highContrast));
  }, [highContrast]);

  const lang = i18n.resolvedLanguage || i18n.language;

  return (
    <div className="bg-navy-dark text-slate-200 text-[11px]">
      <div className="max-w-[1600px] mx-auto px-3 sm:px-5 h-8 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <img src="/assets/gov/flag.svg" alt="" className="h-3 w-auto rounded-[1px] shadow-sm" />
          <span className="font-hindi font-semibold text-white">भारत सरकार</span>
          <span className="text-slate-500">|</span>
          <span className="font-semibold tracking-wide uppercase truncate">Government of India</span>
        </div>
        <div className="flex items-center gap-1 sm:gap-3">
          <a href="#main-content" className="hidden md:inline hover:text-white hover:underline">
            {t('gov.skipToMain', 'Skip to main content')}
          </a>
          <span className="hidden md:inline text-slate-600">|</span>
          <div className="hidden sm:flex items-center gap-0.5" role="group" aria-label={t('gov.textSize', 'Text size')}>
            {[
              ['sm', 'A-'],
              ['base', 'A'],
              ['lg', 'A+'],
            ].map(([k, label]) => (
              <button
                key={k}
                type="button"
                onClick={() => setFontSize(k)}
                aria-pressed={fontSize === k}
                className={`w-6 h-5 rounded text-[10px] font-bold ${fontSize === k ? 'bg-saffron-500 text-navy-dark' : 'hover:bg-white/10'}`}
              >
                {label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setHighContrast((v) => !v)}
            aria-pressed={highContrast}
            title={t('gov.highContrast', 'High contrast')}
            className={`hidden sm:inline-flex items-center justify-center w-6 h-5 rounded font-bold ${highContrast ? 'bg-white text-black' : 'border border-slate-500 hover:bg-white/10'}`}
          >
            ◐
          </button>
          <span className="hidden sm:inline text-slate-600">|</span>
          <div className="flex items-center rounded overflow-hidden border border-slate-600" role="group" aria-label="Language">
            <button
              type="button"
              onClick={() => i18n.changeLanguage('en')}
              aria-pressed={lang === 'en'}
              className={`px-2 h-5 font-semibold ${lang !== 'hi' ? 'bg-white text-navy' : 'hover:bg-white/10'}`}
            >
              English
            </button>
            <button
              type="button"
              onClick={() => i18n.changeLanguage('hi')}
              aria-pressed={lang === 'hi'}
              className={`px-2 h-5 font-hindi font-semibold ${lang === 'hi' ? 'bg-white text-navy' : 'hover:bg-white/10'}`}
            >
              हिंदी
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Emblem + department identity block used by the app header and public pages. */
export function DepartmentIdentity({ compact = false }) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center gap-3 min-w-0">
      <StateEmblem height={compact ? 44 : 54} />
      <div className="h-11 w-px bg-slate-300 hidden xs:block" />
      <div className="min-w-0 leading-tight">
        <div className="font-hindi font-bold text-navy text-[15px] sm:text-base truncate">विधिक माप विज्ञान विभाग</div>
        <div className="font-extrabold text-navy text-[13px] sm:text-[15px] tracking-tight uppercase truncate">
          Department of Legal Metrology
        </div>
        <div className="text-[10.5px] sm:text-[11px] text-slate-500 truncate">
          {t('gov.ministry', 'Ministry of Consumer Affairs, Food & Public Distribution')}
        </div>
      </div>
    </div>
  );
}

const ALERT_ICON = {
  REJECTED: { icon: FiXCircle, cls: 'text-red-600 bg-red-50' },
  EXPIRED: { icon: FiAlertTriangle, cls: 'text-red-600 bg-red-50' },
  DUE_SOON: { icon: FiClock, cls: 'text-amber-600 bg-amber-50' },
  NOT_VERIFIED: { icon: FiEdit3, cls: 'text-slate-600 bg-slate-100' },
  OPEN: { icon: FiEdit3, cls: 'text-primary-700 bg-primary-50' },
};

export default function TopBar({ onToggleSidebar }) {
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { isOnline, pendingCount, isSyncing, triggerSync } = useOfflineSync();

  const [menu, setMenu] = useState(null); // 'user' | 'notif' | 'sync'
  const menuRef = useRef(null);
  useClickOutside(menuRef, () => setMenu(null));

  const [seen, setSeen] = useState(() => {
    try {
      return new Set(JSON.parse(localStorage.getItem('nawi_seen_alerts') || '[]'));
    } catch {
      return new Set();
    }
  });

  const { data: stats } = useQuery({
    queryKey: ['dashboard-stats'],
    enabled: Boolean(user),
    staleTime: 30_000,
    queryFn: async () => (await apiClient.get('/dashboard/stats')).data?.stats,
  });
  const { data: openSessions = [] } = useQuery({
    queryKey: ['open-sessions'],
    enabled: Boolean(user),
    staleTime: 30_000,
    queryFn: async () => (await apiClient.get('/tests', { params: { status: 'IN_PROGRESS', limit: 5 } })).data?.data || [],
  });

  const alerts = [
    ...openSessions.map((s) => ({
      id: `open-${s.id}`,
      kind: 'OPEN',
      title: t('alerts.openSession', 'Verification in progress'),
      body: `${s.instrument?.name || ''} · ${s.certificateNo}`,
      href: `/tests/${s.id}`,
    })),
    ...(stats?.attention || []).map((a) => ({
      id: `${a.status}-${a.id}`,
      kind: a.status,
      title:
        a.status === 'REJECTED'
          ? t('alerts.rejected', 'Instrument rejected — sealed against use')
          : a.status === 'EXPIRED'
            ? t('alerts.expired', 'Verification certificate expired')
            : a.status === 'DUE_SOON'
              ? t('alerts.dueSoon', 'Re-verification due by {{date}}', { date: formatDate(a.validUntil) })
              : t('alerts.notVerified', 'Registered — awaiting first verification'),
      body: `${a.name} · ${a.district || a.location || ''}`,
      href: `/instruments/${a.id}`,
    })),
  ];
  const unread = alerts.filter((a) => !seen.has(a.id)).length;

  const markAllSeen = () => {
    const next = new Set([...seen, ...alerts.map((a) => a.id)]);
    setSeen(next);
    localStorage.setItem('nawi_seen_alerts', JSON.stringify([...next]));
  };

  return (
    <header className="no-print bg-white sticky top-0 z-40 shadow-[0_1px_0_#e2e8f0]">
      <GovStrip />
      <div className="max-w-[1600px] mx-auto px-3 sm:px-5 h-[72px] flex items-center justify-between gap-3" ref={menuRef}>
        <div className="flex items-center gap-2 min-w-0">
          <button
            type="button"
            onClick={onToggleSidebar}
            className="lg:hidden p-2 -ml-1 rounded text-slate-600 hover:bg-slate-100"
            aria-label={t('nav.openMenu', 'Open navigation menu')}
          >
            <FiMenu className="w-5 h-5" />
          </button>
          <Link to="/dashboard" className="min-w-0" aria-label="NAWI-ReportPro home">
            <DepartmentIdentity />
          </Link>
        </div>

        <div className="hidden xl:flex items-center gap-2.5 px-4 py-1.5 rounded-lg border border-slate-200 bg-slate-50">
          <img src="/assets/gov/ashoka-chakra.svg" alt="" className="w-7 h-7" />
          <div className="leading-tight">
            <div className="text-[13px] font-extrabold text-navy tracking-tight">NAWI-ReportPro</div>
            <div className="text-[10px] text-slate-500 font-medium">{t('gov.productTag', 'OIML R 76 Verification & Certification')}</div>
          </div>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2.5">
          {/* Connectivity / offline queue */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setMenu(menu === 'sync' ? null : 'sync')}
              className={`hidden sm:inline-flex items-center gap-1.5 h-8 px-2.5 rounded-full text-[11px] font-bold border ${
                isOnline ? 'bg-green-50 text-green-800 border-green-200' : 'bg-amber-50 text-amber-800 border-amber-300'
              }`}
            >
              {isOnline ? <FiWifi className="w-3.5 h-3.5" /> : <FiWifiOff className="w-3.5 h-3.5" />}
              <span>{isOnline ? t('status.online', 'Online') : t('status.offline', 'Offline')}</span>
              {pendingCount > 0 && <span className="ml-0.5 px-1.5 rounded-full bg-amber-500 text-white">{pendingCount}</span>}
            </button>
            {menu === 'sync' && (
              <div className="absolute right-0 mt-2 w-72 bg-white border border-slate-200 rounded-lg shadow-xl p-4 text-xs z-50">
                <div className="font-bold text-slate-900 mb-1">{t('sync.title', 'Field connectivity')}</div>
                <p className="text-slate-600 mb-3">
                  {isOnline
                    ? t('sync.onlineMsg', 'Connected to the departmental server. Readings are saved directly.')
                    : t('sync.offlineMsg', 'Working offline. Readings are queued on this device and uploaded automatically on reconnection.')}
                </p>
                <div className="flex items-center justify-between py-2 border-t border-slate-100">
                  <span className="text-slate-500">{t('sync.pending', 'Records waiting to upload')}</span>
                  <span className="font-bold text-slate-900">{pendingCount}</span>
                </div>
                <button
                  type="button"
                  disabled={!isOnline || isSyncing || pendingCount === 0}
                  onClick={() => triggerSync()}
                  className="mt-2 w-full inline-flex items-center justify-center gap-1.5 h-8 rounded bg-navy text-white font-bold disabled:opacity-40"
                >
                  <FiRefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                  {t('sync.now', 'Sync now')}
                </button>
              </div>
            )}
          </div>

          {/* Notifications */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setMenu(menu === 'notif' ? null : 'notif')}
              className="relative w-9 h-9 inline-flex items-center justify-center rounded-full text-slate-600 hover:bg-slate-100"
              aria-label={t('nav.notifications', 'Notifications')}
            >
              <FiBell className="w-[18px] h-[18px]" />
              {unread > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-red-600 text-white text-[10px] font-bold flex items-center justify-center ring-2 ring-white">
                  {unread}
                </span>
              )}
            </button>
            {menu === 'notif' && (
              <div className="absolute right-0 mt-2 w-[22rem] max-w-[calc(100vw-1.5rem)] bg-white border border-slate-200 rounded-lg shadow-xl z-50 overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
                  <div>
                    <div className="text-sm font-bold text-slate-900">{t('nav.notifications', 'Notifications')}</div>
                    <div className="text-[11px] text-slate-500">{t('alerts.subtitle', 'Actions needed across your jurisdiction')}</div>
                  </div>
                  {unread > 0 && (
                    <button type="button" onClick={markAllSeen} className="text-[11px] font-bold text-primary-700 hover:underline">
                      {t('alerts.markRead', 'Mark all read')}
                    </button>
                  )}
                </div>
                <ul className="max-h-96 overflow-y-auto divide-y divide-slate-100">
                  {alerts.length === 0 && (
                    <li className="p-6 text-center text-xs text-slate-500">
                      <FiCheckCircle className="w-6 h-6 text-green-600 mx-auto mb-2" />
                      {t('alerts.none', 'All instruments are compliant. Nothing needs attention.')}
                    </li>
                  )}
                  {alerts.map((a) => {
                    const meta = ALERT_ICON[a.kind] || ALERT_ICON.OPEN;
                    const Icon = meta.icon;
                    return (
                      <li key={a.id}>
                        <button
                          type="button"
                          onClick={() => {
                            setSeen(new Set([...seen, a.id]));
                            localStorage.setItem('nawi_seen_alerts', JSON.stringify([...seen, a.id]));
                            setMenu(null);
                            navigate(a.href);
                          }}
                          className={`w-full text-left px-4 py-3 flex gap-3 hover:bg-slate-50 ${seen.has(a.id) ? '' : 'bg-primary-50/40'}`}
                        >
                          <span className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${meta.cls}`}>
                            <Icon className="w-4 h-4" />
                          </span>
                          <span className="min-w-0">
                            <span className="block text-xs font-bold text-slate-900">{a.title}</span>
                            <span className="block text-[11px] text-slate-600 truncate">{a.body}</span>
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </div>

          {/* User */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setMenu(menu === 'user' ? null : 'user')}
              className="flex items-center gap-2 pl-1 pr-2 py-1 rounded-lg hover:bg-slate-100"
              aria-haspopup="menu"
              aria-expanded={menu === 'user'}
            >
              <span className="w-9 h-9 rounded-full bg-navy text-white text-xs font-bold flex items-center justify-center ring-2 ring-saffron-500/70">
                {initials(user?.name)}
              </span>
              <span className="hidden md:block text-left leading-tight max-w-[190px]">
                <span className="block text-[13px] font-bold text-slate-900 truncate">{user?.name}</span>
                <span className="block text-[11px] text-slate-500 truncate">
                  {user?.designation || t(`roles.${user?.role}`, ROLE_LABELS[user?.role] || user?.role)}
                </span>
              </span>
              <FiChevronDown className="w-4 h-4 text-slate-400 hidden md:block" />
            </button>
            {menu === 'user' && (
              <div className="absolute right-0 mt-2 w-72 bg-white border border-slate-200 rounded-lg shadow-xl z-50 overflow-hidden" role="menu">
                <div className="p-4 bg-slate-50 border-b border-slate-200">
                  <div className="text-sm font-bold text-slate-900">{user?.name}</div>
                  <div className="text-xs text-slate-600">{user?.designation}</div>
                  <div className="text-[11px] text-slate-500 mt-0.5">{user?.district}</div>
                  <div className="mt-2 inline-flex text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-navy text-white">
                    {t(`roles.${user?.role}`, ROLE_LABELS[user?.role] || user?.role)}
                  </div>
                </div>
                <div className="p-1.5 text-sm">
                  <div className="px-3 py-2 text-[11px] text-slate-500 flex items-center gap-2">
                    <FiUser className="w-3.5 h-3.5" /> {user?.email}
                  </div>
                  <a
                    href="/verify"
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-2 px-3 py-2 rounded hover:bg-slate-100 text-slate-700 text-[13px]"
                  >
                    <FiExternalLink className="w-4 h-4" /> {t('nav.publicPortal', 'Public verification portal')}
                  </a>
                  <button
                    type="button"
                    onClick={logout}
                    className="w-full flex items-center gap-2 px-3 py-2 rounded hover:bg-red-50 text-red-700 font-semibold text-[13px]"
                    role="menuitem"
                  >
                    <FiLogOut className="w-4 h-4" /> {t('nav.logout', 'Sign out')}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      <TricolorBar thickness={3} />
    </header>
  );
}
