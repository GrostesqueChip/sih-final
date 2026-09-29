import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import {
  FiPlusCircle,
  FiClipboard,
  FiShield,
  FiCalendar,
  FiArrowRight,
  FiAlertTriangle,
  FiXCircle,
  FiClock,
  FiMinusCircle,
  FiCheckCircle,
  FiMapPin,
  FiSearch,
} from 'react-icons/fi';
import { TbScale, TbCurrencyRupee } from 'react-icons/tb';
import apiClient from '../hooks/useApi';
import { useAuth } from '../contexts/AuthContext';
import StatusBadge from '../components/shared/StatusBadge';
import { formatDate, formatINR, complianceLabel, typeLabel, verificationTypeLabel } from '../utils/format';

// Validated (dataviz validator, light surface): CVD-safe, labels always shown.
const PASS_C = '#2a64ad';
const FAIL_C = '#d03b3b';
const COMPLIANCE_ORDER = [
  ['VALID', '#2a64ad', FiCheckCircle],
  ['DUE_SOON', '#d99a00', FiClock],
  ['EXPIRED', '#8b5cf6', FiAlertTriangle],
  ['REJECTED', '#d03b3b', FiXCircle],
  ['NOT_VERIFIED', '#0d9488', FiMinusCircle],
];

function Card({ children, className = '' }) {
  return <section className={`bg-white border border-slate-200 rounded-xl shadow-[0_1px_2px_rgba(15,23,42,0.04)] ${className}`}>{children}</section>;
}

function CardHead({ title, subtitle, action }) {
  return (
    <div className="flex items-start justify-between gap-3 px-5 pt-4 pb-3 border-b border-slate-100">
      <div>
        <h2 className="text-[15px] font-bold text-slate-900">{title}</h2>
        {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

function Kpi({ icon: Icon, label, value, sub, accent = 'bg-primary-50 text-primary-700', to }) {
  const inner = (
    <div className="p-5 flex items-start justify-between gap-3 h-full">
      <div className="min-w-0">
        <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-slate-500">{label}</div>
        <div className="mt-1.5 text-[30px] leading-none font-extrabold text-navy tabular-nums">{value}</div>
        <div className="mt-2 text-xs text-slate-600">{sub}</div>
      </div>
      <span className={`w-11 h-11 rounded-lg flex items-center justify-center shrink-0 ${accent}`}>
        <Icon className="w-5 h-5" />
      </span>
    </div>
  );
  return (
    <Card className={to ? 'hover:border-primary-300 hover:shadow-md transition-all' : ''}>
      {to ? <Link to={to} className="block h-full">{inner}</Link> : inner}
    </Card>
  );
}

function TrendTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const p = payload.find((x) => x.dataKey === 'passed')?.value || 0;
  const f = payload.find((x) => x.dataKey === 'failed')?.value || 0;
  return (
    <div className="bg-white border border-slate-200 rounded-md shadow-lg px-3 py-2 text-xs">
      <div className="font-bold text-slate-900 mb-1">{label}</div>
      <div className="flex items-center gap-2 text-slate-700"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: PASS_C }} /> Approved: <b>{p}</b></div>
      <div className="flex items-center gap-2 text-slate-700"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: FAIL_C }} /> Rejected: <b>{f}</b></div>
    </div>
  );
}

export default function DashboardPage() {
  const { t, i18n } = useTranslation();
  const { user, isInspector } = useAuth();
  const navigate = useNavigate();

  const { data: stats, isLoading } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: async () => (await apiClient.get('/dashboard/stats')).data?.stats,
  });
  const { data: trends } = useQuery({
    queryKey: ['dashboard-trends'],
    queryFn: async () => (await apiClient.get('/dashboard/trends', { params: { months: 6 } })).data,
  });
  const { data: recent = [] } = useQuery({
    queryKey: ['dashboard-recent'],
    queryFn: async () => (await apiClient.get('/dashboard/recent')).data?.recentSessions || [],
  });
  const { data: open = [] } = useQuery({
    queryKey: ['open-sessions-full'],
    queryFn: async () => (await apiClient.get('/tests', { params: { status: 'IN_PROGRESS', limit: 10 } })).data?.data || [],
  });

  const c = stats?.compliance || {};
  const totalInst = stats?.totalInstruments || 0;
  const compliant = (c.VALID || 0) + (c.DUE_SOON || 0);
  const complianceRate = totalInst ? Math.round((compliant / totalInst) * 100) : 0;
  const trendData = (trends?.trends || []).map((b) => ({ ...b, label: `${b.month} ${String(b.year).slice(2)}` }));
  const hour = Number(new Date().toLocaleString('en-IN', { hour: 'numeric', hour12: false, timeZone: 'Asia/Kolkata' }));
  const greeting = hour < 12 ? t('dash.morning', 'Good morning') : hour < 17 ? t('dash.afternoon', 'Good afternoon') : t('dash.evening', 'Good evening');
  const today = new Date().toLocaleDateString(i18n.language === 'hi' ? 'hi-IN' : 'en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <div className="space-y-6">
      {/* Welcome banner */}
      <div className="relative overflow-hidden rounded-xl text-white shadow-sm">
        <img src="/assets/photos/mandi-labour.jpg" alt="" className="absolute inset-0 w-full h-full object-cover object-[center_60%]" />
        <div className="absolute inset-0 bg-gradient-to-r from-navy via-navy/90 to-navy/50" />
        <div className="relative p-6 sm:p-7 flex flex-col lg:flex-row lg:items-end lg:justify-between gap-5">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-saffron-500 flex items-center gap-2">
              <FiCalendar className="w-3.5 h-3.5" /> {today}
            </div>
            <h1 className="mt-2 text-2xl sm:text-[28px] font-extrabold leading-tight">
              {greeting}, {user?.name}
            </h1>
            <p className="text-sm text-slate-200 mt-1">
              {user?.designation}
              {user?.district ? ` · ${user.district}` : ''}
            </p>
            <p className="text-[13px] text-slate-300 mt-3 max-w-2xl">
              {t('dash.summary', '{{open}} verification(s) in progress · {{attention}} instrument(s) need attention · {{month}} certificate(s) issued this month.', {
                open: open.length,
                attention: stats?.attention?.length || 0,
                month: stats?.verificationsThisMonth || 0,
              })}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {isInspector && (
              <>
                <button type="button" onClick={() => navigate('/tests/new')} className="inline-flex items-center gap-2 h-10 px-4 rounded-md bg-saffron-500 hover:bg-saffron-600 text-navy-dark text-sm font-bold shadow">
                  <FiPlusCircle className="w-4 h-4" /> {t('nav.startVerification', 'Start Verification')}
                </button>
                <button type="button" onClick={() => navigate('/instruments/new')} className="inline-flex items-center gap-2 h-10 px-4 rounded-md bg-white/10 hover:bg-white/20 border border-white/30 text-white text-sm font-bold">
                  <TbScale className="w-4 h-4" /> {t('dash.register', 'Register Instrument')}
                </button>
              </>
            )}
            <a href="/verify" target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 h-10 px-4 rounded-md bg-white/10 hover:bg-white/20 border border-white/30 text-white text-sm font-bold">
              <FiSearch className="w-4 h-4" /> {t('dash.publicVerify', 'Public Verification')}
            </a>
          </div>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <Kpi
          icon={TbScale}
          label={t('dash.kpiInstruments', 'Registered instruments')}
          value={isLoading ? '—' : totalInst}
          sub={t('dash.kpiInstrumentsSub', 'across {{n}} districts', { n: stats?.districts?.length || 0 })}
          to="/instruments"
        />
        <Kpi
          icon={FiShield}
          label={t('dash.kpiCompliance', 'Stamping compliance')}
          value={isLoading ? '—' : `${complianceRate}%`}
          sub={t('dash.kpiComplianceSub', '{{n}} of {{t}} hold a valid certificate', { n: compliant, t: totalInst })}
          accent="bg-green-50 text-green-700"
          to="/instruments"
        />
        <Kpi
          icon={FiClipboard}
          label={t('dash.kpiMonth', 'Verified this month')}
          value={isLoading ? '—' : stats?.verificationsThisMonth ?? 0}
          sub={t('dash.kpiMonthSub', '{{n}} sessions still open', { n: open.length })}
          accent="bg-saffron-50 text-saffron-700"
          to="/tests"
        />
        <Kpi
          icon={TbCurrencyRupee}
          label={t('dash.kpiFees', 'Verification fees (FY {{fy}})', { fy: stats?.financialYear || '' })}
          value={isLoading ? '—' : formatINR(stats?.feesThisFy || 0)}
          sub={t('dash.kpiFeesSub', 'Collected under LM (General) Rules, 2011')}
          accent="bg-slate-100 text-slate-700"
        />
      </div>

      {/* Charts */}
      <div className="grid gap-4 xl:grid-cols-5">
        <Card className="xl:col-span-3">
          <CardHead
            title={t('dash.trendTitle', 'Verification outcomes by month')}
            subtitle={t('dash.trendSub', 'Sealed certificates in the last 6 months — approved vs rejected')}
            action={
              trends?.totals?.passRate != null && (
                <div className="text-right">
                  <div className="text-lg font-extrabold text-navy tabular-nums">{trends.totals.passRate}%</div>
                  <div className="text-[10.5px] text-slate-500 uppercase font-bold tracking-wide">{t('dash.approvalRate', 'Approval rate')}</div>
                </div>
              )
            }
          />
          <div className="px-3 pt-4 pb-2 h-[270px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={trendData} margin={{ top: 8, right: 12, left: -12, bottom: 0 }} barCategoryGap="32%">
                <CartesianGrid vertical={false} stroke="#EEF2F6" />
                <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: '#CBD5E1' }} tick={{ fontSize: 12, fill: '#475569' }} />
                <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: '#64748B' }} />
                <Tooltip content={<TrendTooltip />} cursor={{ fill: 'rgba(42,100,173,0.06)' }} />
                <Bar isAnimationActive={false} dataKey="passed" stackId="a" fill={PASS_C} stroke="#fff" strokeWidth={2} maxBarSize={44} />
                <Bar isAnimationActive={false} dataKey="failed" stackId="a" fill={FAIL_C} stroke="#fff" strokeWidth={2} radius={[4, 4, 0, 0]} maxBarSize={44} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="px-5 pb-4 flex items-center gap-5 text-xs text-slate-600">
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm" style={{ background: PASS_C }} /> {t('dash.approved', 'Approved (conforms)')} · <b className="text-slate-900">{trends?.totals?.passed ?? 0}</b></span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm" style={{ background: FAIL_C }} /> {t('dash.rejected', 'Rejected (MPE exceeded)')} · <b className="text-slate-900">{trends?.totals?.failed ?? 0}</b></span>
          </div>
        </Card>

        <Card className="xl:col-span-2">
          <CardHead title={t('dash.complianceTitle', 'Registry compliance status')} subtitle={t('dash.complianceSub', 'Stamping validity of every active instrument (12-month cycle)')} />
          <div className="p-5">
            <div className="flex h-4 w-full rounded-full overflow-hidden bg-slate-100 gap-[2px]">
              {COMPLIANCE_ORDER.map(([k, color]) =>
                c[k] ? <div key={k} style={{ width: `${(c[k] / Math.max(1, totalInst)) * 100}%`, background: color }} title={`${complianceLabel(k)}: ${c[k]}`} /> : null
              )}
            </div>
            <ul className="mt-5 divide-y divide-slate-100">
              {COMPLIANCE_ORDER.map(([k, color, Icon]) => (
                <li key={k}>
                  <Link to={`/instruments?compliance=${k}`} className="flex items-center gap-3 py-2.5 group">
                    <span className="w-3 h-3 rounded-sm shrink-0" style={{ background: color }} />
                    <Icon className="w-4 h-4 text-slate-500" />
                    <span className="flex-1 text-sm text-slate-700 group-hover:text-navy group-hover:underline">{complianceLabel(k)}</span>
                    <span className="text-sm font-extrabold text-slate-900 tabular-nums">{c[k] || 0}</span>
                    <span className="w-12 text-right text-xs text-slate-500 tabular-nums">{totalInst ? Math.round(((c[k] || 0) / totalInst) * 100) : 0}%</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </Card>
      </div>

      {/* Work queues */}
      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHead
            title={t('dash.openTitle', 'Verifications in progress')}
            subtitle={t('dash.openSub', 'Resume field sessions — modules recorded out of 6')}
            action={<Link to="/tests?status=IN_PROGRESS" className="text-xs font-bold text-primary-700 hover:underline whitespace-nowrap">{t('common.viewAll', 'View all')}</Link>}
          />
          <ul className="divide-y divide-slate-100">
            {open.length === 0 && <li className="p-6 text-sm text-center text-slate-500">{t('dash.noOpen', 'No open sessions. Start a new verification to begin.')}</li>}
            {open.map((s) => {
              const done = (s.testResults || []).filter((r) => r.status === 'COMPLETED').length;
              return (
                <li key={s.id} className="px-5 py-3.5 flex items-center gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-bold text-slate-900 truncate">{s.instrument?.name}</div>
                    <div className="text-xs text-slate-500 mt-0.5 font-mono">{s.certificateNo} · {s.conductedBy?.name}</div>
                    <div className="mt-2 flex items-center gap-2">
                      <div className="flex gap-1">
                        {Array.from({ length: 6 }, (_, i) => (
                          <span key={i} className={`h-1.5 w-7 rounded-full ${i < done ? 'bg-primary-600' : 'bg-slate-200'}`} />
                        ))}
                      </div>
                      <span className="text-[11px] font-bold text-slate-600">{done}/6</span>
                    </div>
                  </div>
                  <button type="button" onClick={() => navigate(`/tests/${s.id}`)} className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md bg-navy text-white text-xs font-bold hover:bg-navy-light shrink-0">
                    {done === 6 ? t('dash.finalize', 'Finalise') : t('dash.resume', 'Resume')} <FiArrowRight className="w-3.5 h-3.5" />
                  </button>
                </li>
              );
            })}
          </ul>
        </Card>

        <Card>
          <CardHead
            title={t('dash.attentionTitle', 'Instruments needing action')}
            subtitle={t('dash.attentionSub', 'Rejected, expired or due for re-verification')}
            action={<Link to="/instruments" className="text-xs font-bold text-primary-700 hover:underline whitespace-nowrap">{t('dash.registry', 'Open registry')}</Link>}
          />
          <ul className="divide-y divide-slate-100">
            {(stats?.attention || []).length === 0 && <li className="p-6 text-sm text-center text-slate-500">{t('alerts.none', 'All instruments are compliant. Nothing needs attention.')}</li>}
            {(stats?.attention || []).map((a) => (
              <li key={a.id}>
                <Link to={`/instruments/${a.id}`} className="px-5 py-3 flex items-center gap-3 hover:bg-slate-50">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-bold text-slate-900 truncate">{a.name}</div>
                    <div className="text-xs text-slate-500 mt-0.5 flex items-center gap-1 truncate">
                      <FiMapPin className="w-3 h-3 shrink-0" /> {a.district} · {typeLabel(a.type)}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <StatusBadge status={a.status} size="xs" />
                    <div className="text-[11px] text-slate-500 mt-1">
                      {a.status === 'DUE_SOON' && t('dash.validTill', 'valid till {{d}}', { d: formatDate(a.validUntil) })}
                      {a.status === 'EXPIRED' && t('dash.expiredOn', 'expired {{d}}', { d: formatDate(a.validUntil) })}
                      {a.status === 'REJECTED' && t('dash.rejectedOn', 'rejected {{d}}', { d: formatDate(a.lastVerifiedAt) })}
                      {a.status === 'NOT_VERIFIED' && (a.inProgress ? t('dash.inProgress', 'verification in progress') : t('dash.awaiting', 'awaiting first verification'))}
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      {/* District & officers */}
      <div className="grid gap-4 xl:grid-cols-5">
        <Card className="xl:col-span-3 overflow-hidden">
          <CardHead title={t('dash.districtTitle', 'District-wise summary')} subtitle={t('dash.districtSub', 'Instruments, certificates and rejections by jurisdiction')} />
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="text-left font-bold px-5 py-2.5">{t('dash.district', 'District')}</th>
                  <th className="text-right font-bold px-3 py-2.5">{t('dash.instruments', 'Instruments')}</th>
                  <th className="text-right font-bold px-3 py-2.5">{t('dash.sessions', 'Sessions')}</th>
                  <th className="text-right font-bold px-3 py-2.5">{t('dash.rejectedCol', 'Rejected')}</th>
                  <th className="text-left font-bold px-5 py-2.5 w-40">{t('dash.compliant', 'Compliant')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(stats?.districts || []).map((d) => {
                  const pct = d.instruments ? Math.round((d.compliant / d.instruments) * 100) : 0;
                  return (
                    <tr key={d.district} className="hover:bg-slate-50">
                      <td className="px-5 py-2.5 font-semibold text-slate-800">{d.district}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{d.instruments}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{d.verifications}</td>
                      <td className={`px-3 py-2.5 text-right tabular-nums ${d.rejected ? 'text-red-700 font-bold' : 'text-slate-400'}`}>{d.rejected}</td>
                      <td className="px-5 py-2.5">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                            <div className="h-full rounded-full" style={{ width: `${pct}%`, background: PASS_C }} />
                          </div>
                          <span className="text-xs font-bold text-slate-700 w-9 text-right tabular-nums">{pct}%</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>

        <Card className="xl:col-span-2 overflow-hidden">
          <CardHead title={t('dash.officerTitle', 'Officer workload')} subtitle={t('dash.officerSub', 'Sessions conducted since deployment')} />
          <ul className="divide-y divide-slate-100">
            {(stats?.officers || []).map((o) => (
              <li key={o.id} className="px-5 py-3 flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-slate-800 truncate">{o.name}</div>
                  <div className="text-[11px] text-slate-500">
                    {o.passed} {t('dash.approvedShort', 'approved')} · {o.failed} {t('dash.rejectedShort', 'rejected')}
                    {o.open ? ` · ${o.open} ${t('dash.openShort', 'open')}` : ''}
                  </div>
                </div>
                <span className="text-lg font-extrabold text-navy tabular-nums">{o.sessions}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      {/* Recent */}
      <Card className="overflow-hidden">
        <CardHead
          title={t('dash.recentTitle', 'Recent verification sessions')}
          subtitle={t('dash.recentSub', 'Latest field and laboratory verifications')}
          action={<Link to="/tests" className="text-xs font-bold text-primary-700 hover:underline whitespace-nowrap">{t('common.viewAll', 'View all')}</Link>}
        />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
              <tr>
                <th className="text-left font-bold px-5 py-2.5">{t('table.certificate', 'Certificate no.')}</th>
                <th className="text-left font-bold px-3 py-2.5">{t('table.instrument', 'Instrument')}</th>
                <th className="text-left font-bold px-3 py-2.5">{t('table.type', 'Type')}</th>
                <th className="text-left font-bold px-3 py-2.5">{t('table.date', 'Date')}</th>
                <th className="text-left font-bold px-3 py-2.5">{t('table.officer', 'Officer')}</th>
                <th className="text-left font-bold px-3 py-2.5">{t('table.result', 'Result')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {recent.slice(0, 8).map((s) => (
                <tr key={s.id} onClick={() => navigate(`/tests/${s.id}`)} className="hover:bg-primary-50/40 cursor-pointer">
                  <td className="px-5 py-3 font-mono text-[12.5px] font-semibold text-primary-700">{s.certificateNo}</td>
                  <td className="px-3 py-3">
                    <div className="font-semibold text-slate-800">{s.instrument?.name}</div>
                    <div className="text-[11px] text-slate-500">{s.instrument?.model} · S/N {s.instrument?.serialNumber}</div>
                  </td>
                  <td className="px-3 py-3 text-xs text-slate-600">{verificationTypeLabel(s.verificationType)}</td>
                  <td className="px-3 py-3 text-xs text-slate-600 whitespace-nowrap">{formatDate(s.completedAt || s.startedAt)}</td>
                  <td className="px-3 py-3 text-xs text-slate-700">{s.conductedBy?.name}</td>
                  <td className="px-3 py-3">
                    <StatusBadge status={s.status === 'COMPLETED' ? s.overallResult : 'IN_PROGRESS'} size="xs" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
