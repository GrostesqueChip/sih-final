import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { FiUserPlus, FiEdit2, FiUsers, FiX, FiSave, FiMail, FiPhone, FiMapPin } from 'react-icons/fi';

import apiClient from '../../hooks/useApi';
import PageHeader from '../../components/shared/PageHeader';
import StatusBadge from '../../components/shared/StatusBadge';
import { TricolorBar } from '../../components/common/StateEmblem';
import { useAuth } from '../../contexts/AuthContext';
import { initials, formatDateTime, ROLE_LABELS } from '../../utils/format';

const DESIGNATIONS = [
  'Controller of Legal Metrology',
  'Deputy Controller of Legal Metrology',
  'Assistant Controller of Legal Metrology',
  'Inspector of Legal Metrology',
  'Senior Scientific Officer (Mass)',
  'Audit Officer (Internal Audit Wing)',
];

const EMPTY = { name: '', email: '', password: '', role: 'INSPECTOR', designation: 'Inspector of Legal Metrology', district: '', phone: '', isActive: true };

export default function UserManagementPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { user: me } = useAuth();
  const [editing, setEditing] = useState(null); // null | 'new' | user
  const [form, setForm] = useState(EMPTY);

  const { data: users = [], isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: async () => (await apiClient.get('/users', { params: { limit: 100 } })).data?.data || [],
  });

  const save = useMutation({
    mutationFn: async () => {
      const body = { ...form };
      if (editing !== 'new' && !body.password) delete body.password;
      return editing === 'new' ? apiClient.post('/users', body) : apiClient.put(`/users/${editing.id}`, body);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] });
      toast.success(editing === 'new' ? t('users.created', 'Officer account created') : t('users.updated', 'Officer details updated'));
      setEditing(null);
    },
    onError: (err) => toast.error(err.response?.data?.message || err.response?.data?.errors?.[0]?.msg || t('users.fail', 'Could not save')),
  });

  const open = (u) => {
    setEditing(u);
    setForm(u === 'new' ? EMPTY : { ...EMPTY, ...u, password: '', designation: u.designation || '', district: u.district || '', phone: u.phone || '' });
  };
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  const input = 'w-full h-10 px-3 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500/30';

  const active = users.filter((u) => u.isActive).length;

  return (
    <div>
      <PageHeader
        icon={FiUsers}
        eyebrow={t('users.eyebrow', 'Administration')}
        title={t('users.title', 'Officers & Users')}
        subtitle={t('users.subtitle', 'Accounts of Legal Metrology officers, laboratory staff and auditors, with their role-based access.')}
        actions={
          <button type="button" onClick={() => open('new')} className="inline-flex items-center gap-2 h-10 px-4 rounded-md bg-navy text-white text-sm font-bold hover:bg-navy-light">
            <FiUserPlus className="w-4 h-4" /> {t('users.add', 'Add officer')}
          </button>
        }
      />

      <div className="grid sm:grid-cols-3 gap-4 mb-4">
        {[
          [t('users.total', 'Total accounts'), users.length],
          [t('users.active', 'Active'), active],
          [t('users.inspectors', 'Field & lab officers'), users.filter((u) => u.role === 'INSPECTOR' && u.isActive).length],
        ].map(([label, n]) => (
          <div key={label} className="bg-white border border-slate-200 rounded-xl p-5">
            <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{label}</div>
            <div className="text-3xl font-extrabold text-navy mt-1">{n}</div>
          </div>
        ))}
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
              <tr>
                <th className="text-left font-bold px-5 py-3">{t('users.officer', 'Officer')}</th>
                <th className="text-left font-bold px-3 py-3">{t('users.designation', 'Designation · jurisdiction')}</th>
                <th className="text-left font-bold px-3 py-3">{t('users.role', 'Access role')}</th>
                <th className="text-right font-bold px-3 py-3">{t('users.sessions', 'Sessions')}</th>
                <th className="text-left font-bold px-3 py-3">{t('users.lastLogin', 'Last sign-in')}</th>
                <th className="text-left font-bold px-3 py-3">{t('common.status', 'Status')}</th>
                <th className="text-right font-bold px-5 py-3">{t('common.actions', 'Actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading && <tr><td colSpan={7} className="px-5 py-10 text-center text-slate-500">{t('common.loading', 'Loading…')}</td></tr>}
              {users.map((u) => (
                <tr key={u.id} className={`hover:bg-slate-50 ${u.isActive ? '' : 'opacity-60'}`}>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-3">
                      <span className={`w-10 h-10 rounded-full text-xs font-bold flex items-center justify-center shrink-0 ${u.role === 'ADMIN' ? 'bg-navy text-white ring-2 ring-saffron-500' : u.role === 'VIEWER' ? 'bg-slate-200 text-slate-700' : 'bg-primary-100 text-primary-800'}`}>{initials(u.name)}</span>
                      <div className="min-w-0">
                        <div className="font-bold text-slate-900">{u.name} {u.id === me?.id && <span className="text-[10px] font-bold text-saffron-700 ml-1">({t('users.you', 'you')})</span>}</div>
                        <div className="text-[11.5px] text-slate-500 font-mono">{u.email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <div className="text-[13px] text-slate-800">{u.designation || '—'}</div>
                    <div className="text-[11.5px] text-slate-500 flex items-center gap-1"><FiMapPin className="w-3 h-3" /> {u.district || '—'}</div>
                  </td>
                  <td className="px-3 py-3"><StatusBadge status={u.role} size="xs" icon={false} /></td>
                  <td className="px-3 py-3 text-right tabular-nums font-semibold">{u._count?.testSessions ?? 0}</td>
                  <td className="px-3 py-3 text-xs text-slate-600 whitespace-nowrap">{formatDateTime(u.lastLoginAt)}</td>
                  <td className="px-3 py-3"><StatusBadge status={u.isActive ? 'ACTIVE' : 'INACTIVE'} size="xs" /></td>
                  <td className="px-5 py-3 text-right">
                    <button type="button" onClick={() => open(u)} className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-white">
                      <FiEdit2 className="w-3.5 h-3.5" /> {t('common.edit', 'Edit')}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {editing && (
        <div className="fixed inset-0 z-[80] bg-slate-900/60 flex items-center justify-center p-4" onClick={() => setEditing(null)}>
          <form
            className="bg-white rounded-xl shadow-2xl w-full max-w-xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
            onSubmit={(e) => {
              e.preventDefault();
              save.mutate();
            }}
            role="dialog"
            aria-modal="true"
          >
            <TricolorBar thickness={3} />
            <div className="p-6">
              <div className="flex items-start justify-between">
                <h2 className="text-lg font-extrabold text-navy">{editing === 'new' ? t('users.addTitle', 'Add an officer account') : t('users.editTitle', 'Edit {{n}}', { n: editing.name })}</h2>
                <button type="button" onClick={() => setEditing(null)} className="p-1 rounded hover:bg-slate-100 text-slate-500" aria-label="Close"><FiX className="w-5 h-5" /></button>
              </div>
              <div className="mt-4 grid sm:grid-cols-2 gap-4">
                <label className="block sm:col-span-2"><span className="block text-[12.5px] font-bold text-slate-700 mb-1">{t('users.name', 'Full name (with honorific)')}</span><input required className={input} value={form.name} onChange={set('name')} placeholder="Shri / Smt. …" /></label>
                <label className="block"><span className="flex items-center gap-1 text-[12.5px] font-bold text-slate-700 mb-1"><FiMail className="w-3.5 h-3.5" /> {t('users.email', 'Official e-mail')}</span><input required type="email" className={input} value={form.email} onChange={set('email')} placeholder="name@nawi.gov.in" /></label>
                <label className="block"><span className="block text-[12.5px] font-bold text-slate-700 mb-1">{editing === 'new' ? t('users.password', 'Initial password') : t('users.newPassword', 'New password (optional)')}</span><input type="password" required={editing === 'new'} minLength={6} className={input} value={form.password} onChange={set('password')} /></label>
                <label className="block"><span className="block text-[12.5px] font-bold text-slate-700 mb-1">{t('users.role', 'Access role')}</span>
                  <select className={input} value={form.role} onChange={set('role')}>
                    {Object.entries(ROLE_LABELS).map(([k, v]) => <option key={k} value={k}>{t(`roles.${k}`, v)}</option>)}
                  </select>
                </label>
                <label className="block"><span className="block text-[12.5px] font-bold text-slate-700 mb-1">{t('users.designationOnly', 'Designation')}</span>
                  <select className={input} value={form.designation} onChange={set('designation')}>
                    <option value="">—</option>
                    {DESIGNATIONS.map((d) => <option key={d} value={d}>{d}</option>)}
                  </select>
                </label>
                <label className="block"><span className="flex items-center gap-1 text-[12.5px] font-bold text-slate-700 mb-1"><FiMapPin className="w-3.5 h-3.5" /> {t('users.district', 'District / jurisdiction')}</span><input className={input} value={form.district} onChange={set('district')} placeholder="e.g. Ludhiana" /></label>
                <label className="block"><span className="flex items-center gap-1 text-[12.5px] font-bold text-slate-700 mb-1"><FiPhone className="w-3.5 h-3.5" /> {t('users.phone', 'Office phone')}</span><input className={input} value={form.phone} onChange={set('phone')} placeholder="0161-…" /></label>
                {editing !== 'new' && (
                  <label className="flex items-center gap-2 sm:col-span-2 text-sm text-slate-700">
                    <input type="checkbox" checked={form.isActive} onChange={set('isActive')} disabled={editing.id === me?.id} className="w-4 h-4" />
                    {t('users.isActive', 'Account active (uncheck on transfer or retirement)')}
                  </label>
                )}
              </div>
              <div className="mt-6 flex justify-end gap-2">
                <button type="button" onClick={() => setEditing(null)} className="h-10 px-4 rounded-md border border-slate-300 text-sm font-semibold text-slate-700 hover:bg-slate-50">{t('common.cancel', 'Cancel')}</button>
                <button type="submit" disabled={save.isPending} className="inline-flex items-center gap-2 h-10 px-5 rounded-md bg-navy text-white text-sm font-bold disabled:opacity-60"><FiSave className="w-4 h-4" /> {t('common.save', 'Save')}</button>
              </div>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
