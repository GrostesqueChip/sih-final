import React from 'react';
import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import {
  FiGrid,
  FiFileText,
  FiShield,
  FiUsers,
  FiSettings,
  FiClipboard,
  FiX,
  FiPlusCircle,
  FiPhoneCall,
  FiExternalLink,
} from 'react-icons/fi';
import { TbScale } from 'react-icons/tb';
import { useAuth } from '../../contexts/AuthContext';
import apiClient from '../../hooks/useApi';

export default function Sidebar({ isOpen, onClose }) {
  const { t } = useTranslation();
  const { isAdmin, isInspector, user } = useAuth();

  const { data: openCount = 0 } = useQuery({
    queryKey: ['open-sessions-count'],
    enabled: Boolean(user),
    staleTime: 30_000,
    queryFn: async () => (await apiClient.get('/tests', { params: { status: 'IN_PROGRESS', limit: 1 } })).data?.pagination?.total || 0,
  });

  const groups = [
    {
      label: t('nav.groupMain', 'Main menu'),
      items: [
        { to: '/dashboard', label: t('nav.dashboard', 'Dashboard'), icon: FiGrid, show: true },
        { to: '/instruments', label: t('nav.instruments', 'Instrument Registry'), icon: TbScale, show: true },
        { to: '/tests', label: t('nav.testSessions', 'Verification Sessions'), icon: FiClipboard, show: true, badge: openCount },
        { to: '/reports', label: t('nav.reports', 'Certificates & Reports'), icon: FiFileText, show: true },
      ],
    },
    {
      label: t('nav.groupAdmin', 'Administration'),
      items: [
        { to: '/audit', label: t('nav.auditLog', 'Audit Trail'), icon: FiShield, show: isAdmin || isInspector || user?.role === 'VIEWER' },
        { to: '/users', label: t('nav.userManagement', 'Officers & Users'), icon: FiUsers, show: isAdmin },
        { to: '/settings', label: t('nav.settings', 'Settings'), icon: FiSettings, show: isAdmin },
      ],
    },
  ];

  return (
    <>
      {isOpen && <div onClick={onClose} className="fixed inset-0 z-40 bg-slate-900/50 lg:hidden" aria-hidden="true" />}

      <aside
        className={`no-print fixed lg:sticky top-0 lg:top-[107px] left-0 z-50 lg:z-10 h-screen lg:h-[calc(100vh-107px)] w-64 shrink-0 bg-white border-r border-slate-200 flex flex-col transition-transform duration-200 ${
          isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
        aria-label={t('nav.primary', 'Primary navigation')}
      >
        <div className="flex items-center justify-between p-4 border-b border-slate-200 lg:hidden">
          <span className="font-extrabold text-navy">NAWI-ReportPro</span>
          <button type="button" onClick={onClose} className="p-1 rounded text-slate-500 hover:bg-slate-100" aria-label={t('common.close', 'Close')}>
            <FiX className="w-5 h-5" />
          </button>
        </div>

        {isInspector && (
          <div className="p-3 border-b border-slate-100">
            <NavLink
              to="/tests/new"
              onClick={() => onClose && onClose()}
              className="flex items-center justify-center gap-2 h-10 rounded-md bg-saffron-500 hover:bg-saffron-600 text-navy-dark text-sm font-bold shadow-sm"
            >
              <FiPlusCircle className="w-4 h-4" />
              {t('nav.startVerification', 'Start Verification')}
            </NavLink>
          </div>
        )}

        <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-5">
          {groups.map((g) => {
            const items = g.items.filter((i) => i.show);
            if (!items.length) return null;
            return (
              <div key={g.label}>
                <div className="px-3 mb-1.5 text-[10.5px] font-bold uppercase tracking-[0.12em] text-slate-400">{g.label}</div>
                <ul className="space-y-0.5">
                  {items.map((item) => {
                    const Icon = item.icon;
                    return (
                      <li key={item.to}>
                        <NavLink
                          to={item.to}
                          end={item.to === '/tests' ? false : undefined}
                          onClick={() => onClose && onClose()}
                          className={({ isActive }) =>
                            `group flex items-center gap-3 px-3 h-10 rounded-md text-[13.5px] transition-colors ${
                              isActive
                                ? 'bg-navy text-white font-semibold shadow-sm'
                                : 'text-slate-700 hover:bg-slate-100 hover:text-navy font-medium'
                            }`
                          }
                        >
                          {({ isActive }) => (
                            <>
                              <Icon className={`w-[18px] h-[18px] shrink-0 ${isActive ? 'text-saffron-500' : 'text-slate-500 group-hover:text-navy'}`} />
                              <span className="flex-1 truncate">{item.label}</span>
                              {item.badge > 0 && (
                                <span className={`text-[10px] font-bold px-1.5 min-w-[20px] text-center rounded-full ${isActive ? 'bg-saffron-500 text-navy-dark' : 'bg-primary-100 text-primary-800'}`}>
                                  {item.badge}
                                </span>
                              )}
                            </>
                          )}
                        </NavLink>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </nav>

        <div className="p-3 border-t border-slate-200 space-y-2">
          <a
            href="https://consumerhelpline.gov.in/"
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-3 p-3 rounded-lg bg-gradient-to-br from-navy to-primary-700 text-white hover:opacity-95"
          >
            <FiPhoneCall className="w-5 h-5 text-saffron-500 shrink-0" />
            <span className="leading-tight">
              <span className="block text-[10.5px] text-slate-300">{t('nav.helpline', 'National Consumer Helpline')}</span>
              <span className="block text-lg font-extrabold tracking-wide">1915</span>
            </span>
            <FiExternalLink className="w-3.5 h-3.5 ml-auto text-slate-300" />
          </a>
          <div className="flex items-center justify-between text-[10.5px] text-slate-400 px-1">
            <span>NAWI-ReportPro v2.0</span>
            <span>OIML R 76-1:2006</span>
          </div>
        </div>
      </aside>
    </>
  );
}
