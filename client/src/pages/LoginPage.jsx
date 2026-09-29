import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { FiLock, FiMail, FiEye, FiEyeOff, FiArrowRight, FiShield, FiCheckCircle, FiSearch, FiAlertCircle } from 'react-icons/fi';
import { useAuth } from '../contexts/AuthContext';
import StateEmblem, { TricolorBar } from '../components/common/StateEmblem';
import { GovStrip } from '../components/layout/TopBar';
import { ROLE_LABELS } from '../utils/format';

const DEMO = [
  {
    role: 'INSPECTOR',
    email: 'inspector@nawi.gov.in',
    password: 'Inspector@123',
    name: 'Shri Vikramaditya Sharma',
    title: 'Inspector of Legal Metrology, Ludhiana',
    what: 'Field officer — records tests, captures readings, seals certificates',
    color: 'from-primary-700 to-primary-900',
  },
  {
    role: 'ADMIN',
    email: 'admin@nawi.gov.in',
    password: 'Admin@123',
    name: 'Shri Rajesh Kumar',
    title: 'Controller of Legal Metrology, Punjab',
    what: 'State head — full access, officers, settings, all districts',
    color: 'from-navy to-navy-dark',
  },
  {
    role: 'VIEWER',
    email: 'viewer@nawi.gov.in',
    password: 'Viewer@123',
    name: 'Smt. Ananya Sen',
    title: 'Audit Officer (Internal Audit Wing)',
    what: 'Read-only — reviews certificates and the audit trail',
    color: 'from-slate-600 to-slate-800',
  },
];

export default function LoginPage() {
  const { t } = useTranslation();
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const expired = new URLSearchParams(location.search).get('expired');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');

  const from = location.state?.from?.pathname || '/dashboard';

  const doLogin = async (em, pw, tag) => {
    setErrorMsg('');
    setBusy(tag);
    try {
      const u = await login(em, pw);
      toast.success(t('login.welcome', 'Welcome, {{name}}', { name: u?.name || '' }));
      navigate(tag === 'form' ? from : '/dashboard', { replace: true });
    } catch (err) {
      const message = err.response?.data?.message || t('login.invalid', 'Invalid email or password');
      setErrorMsg(message);
    } finally {
      setBusy(null);
    }
  };

  const onSubmit = (e) => {
    e.preventDefault();
    if (!email || !password) {
      setErrorMsg(t('login.required', 'Enter your official e-mail and password.'));
      return;
    }
    doLogin(email.trim(), password, 'form');
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#F3F6FA]">
      <GovStrip />
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-[1.1fr_1fr]">
        {/* Visual panel */}
        <div className="relative hidden lg:flex flex-col justify-between overflow-hidden text-white">
          <img src="/assets/photos/grain-market.jpg" alt="" className="absolute inset-0 w-full h-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-navy via-navy/80 to-navy/40" />
          <img src="/assets/gov/ashoka-chakra.svg" alt="" className="absolute -right-24 -bottom-24 w-[420px] opacity-[0.07] invert" />

          <div className="relative p-10 xl:p-14">
            <div className="flex items-center gap-4">
              <StateEmblem light height={78} />
              <div className="h-14 w-px bg-white/30" />
              <div>
                <div className="font-hindi text-xl font-bold">विधिक माप विज्ञान विभाग</div>
                <div className="text-lg font-extrabold uppercase tracking-wide">Department of Legal Metrology</div>
                <div className="text-sm text-slate-300">Ministry of Consumer Affairs, Food &amp; Public Distribution</div>
              </div>
            </div>
          </div>

          <div className="relative px-10 xl:px-14 pb-10 xl:pb-14">
            <div className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.18em] text-saffron-500 mb-3">
              <span className="w-6 h-[2px] bg-saffron-500" /> NAWI-ReportPro
            </div>
            <h1 className="text-4xl xl:text-[44px] font-extrabold leading-[1.1] max-w-xl">
              {t('login.hero', 'Every weighing scale in the mandi, verified and certified — digitally.')}
            </h1>
            <p className="mt-4 text-slate-300 max-w-lg text-[15px] leading-relaxed">
              {t(
                'login.heroSub',
                'OIML R 76 test recording, automatic MPE evaluation, tamper-evident sealed certificates and public QR verification for weighbridges, platform scales and laboratory balances.'
              )}
            </p>
            <div className="mt-8 grid grid-cols-3 gap-3 max-w-xl">
              {[
                ['6', t('login.f1', 'OIML R 76 tests automated')],
                ['HMAC', t('login.f2', 'SHA-256 sealed certificates')],
                ['QR', t('login.f3', 'Instant public verification')],
              ].map(([big, small]) => (
                <div key={small} className="rounded-lg bg-white/10 border border-white/15 backdrop-blur-sm p-3">
                  <div className="text-xl font-extrabold text-saffron-500">{big}</div>
                  <div className="text-[12px] text-slate-200 leading-snug mt-0.5">{small}</div>
                </div>
              ))}
            </div>
            <p className="mt-8 text-[11px] text-slate-400">Photo: Grain Market, Bhawanigarh (Sangrur), Punjab · Wikimedia Commons</p>
          </div>
        </div>

        {/* Form panel */}
        <div className="min-w-0 flex items-center justify-center px-4 py-10 sm:px-8">
          <div className="w-full max-w-[460px] min-w-0">
            <div className="lg:hidden flex items-center gap-3 mb-6">
              <StateEmblem height={56} />
              <div>
                <div className="font-hindi font-bold text-navy">विधिक माप विज्ञान विभाग</div>
                <div className="text-sm font-extrabold text-navy uppercase">Department of Legal Metrology</div>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <TricolorBar thickness={3} />
              <div className="p-6 sm:p-8">
                <div className="flex items-center gap-2 text-saffron-700 text-[11px] font-bold uppercase tracking-[0.14em]">
                  <FiShield className="w-3.5 h-3.5" /> {t('login.secure', 'Authorised officers only')}
                </div>
                <h2 className="mt-1 text-2xl font-extrabold text-navy">
                  {t('login.title', 'Officer Sign-in')} <span className="font-hindi text-lg text-slate-400 font-bold">/ अधिकारी लॉगिन</span>
                </h2>

                {expired && !errorMsg && (
                  <div className="mt-4 p-3 rounded-md bg-amber-50 border border-amber-200 text-xs text-amber-800 flex gap-2">
                    <FiAlertCircle className="w-4 h-4 shrink-0" /> {t('login.expired', 'Your session expired. Please sign in again.')}
                  </div>
                )}
                {errorMsg && (
                  <div className="mt-4 p-3 rounded-md bg-red-50 border border-red-200 text-xs font-medium text-red-700 flex gap-2" role="alert">
                    <FiAlertCircle className="w-4 h-4 shrink-0" /> {errorMsg}
                  </div>
                )}

                <form onSubmit={onSubmit} className="mt-5 space-y-4" noValidate>
                  <div>
                    <label htmlFor="email" className="block text-xs font-bold text-slate-700 mb-1.5">
                      {t('login.email', 'Official e-mail ID')}
                    </label>
                    <div className="relative">
                      <FiMail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <input
                        id="email"
                        type="email"
                        autoComplete="username"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="name@nawi.gov.in"
                        className="w-full h-11 pl-10 pr-3 text-sm bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500/40 focus:border-primary-500"
                      />
                    </div>
                  </div>
                  <div>
                    <label htmlFor="password" className="block text-xs font-bold text-slate-700 mb-1.5">
                      {t('login.password', 'Password')}
                    </label>
                    <div className="relative">
                      <FiLock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <input
                        id="password"
                        type={showPw ? 'text' : 'password'}
                        autoComplete="current-password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="w-full h-11 pl-10 pr-10 text-sm bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500/40 focus:border-primary-500"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPw((v) => !v)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-slate-400 hover:text-slate-700"
                        aria-label={showPw ? 'Hide password' : 'Show password'}
                      >
                        {showPw ? <FiEyeOff className="w-4 h-4" /> : <FiEye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                  <button
                    type="submit"
                    disabled={Boolean(busy)}
                    className="w-full h-11 inline-flex items-center justify-center gap-2 rounded-md bg-navy hover:bg-navy-light text-white font-bold text-sm shadow-sm disabled:opacity-60"
                  >
                    {busy === 'form' ? t('login.signingIn', 'Signing in…') : t('login.signIn', 'Sign in')}
                    <FiArrowRight className="w-4 h-4" />
                  </button>
                </form>

                <div className="mt-7">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="h-px flex-1 bg-slate-200" />
                    <span className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-slate-500">
                      {t('login.demo', 'One-click demo access')}
                    </span>
                    <div className="h-px flex-1 bg-slate-200" />
                  </div>
                  <div className="space-y-2">
                    {DEMO.map((d) => (
                      <button
                        key={d.role}
                        type="button"
                        disabled={Boolean(busy)}
                        onClick={() => {
                          setEmail(d.email);
                          setPassword(d.password);
                          doLogin(d.email, d.password, d.role);
                        }}
                        className="group w-full flex items-center gap-3 p-2.5 rounded-lg border border-slate-200 hover:border-primary-400 hover:bg-primary-50/50 text-left transition-colors disabled:opacity-60"
                      >
                        <span className={`w-10 h-10 rounded-md bg-gradient-to-br ${d.color} text-white text-[10px] font-extrabold flex items-center justify-center shrink-0`}>
                          {d.role === 'ADMIN' ? 'CTRL' : d.role === 'INSPECTOR' ? 'INSP' : 'AUDIT'}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-[13px] font-bold text-slate-900 truncate">
                            {t(`roles.${d.role}`, ROLE_LABELS[d.role])} — {d.name}
                          </span>
                          <span className="block text-[11px] text-slate-500 truncate">{d.what}</span>
                        </span>
                        {busy === d.role ? (
                          <span className="w-4 h-4 border-2 border-primary-600 border-t-transparent rounded-full animate-spin" />
                        ) : (
                          <FiArrowRight className="w-4 h-4 text-slate-400 group-hover:text-primary-700" />
                        )}
                      </button>
                    ))}
                  </div>
                  <p className="mt-3 text-[11px] text-slate-500 flex items-start gap-1.5">
                    <FiCheckCircle className="w-3.5 h-3.5 text-green-600 mt-px shrink-0" />
                    {t('login.demoNote', 'Demo data: 16 instruments across 11 districts, 36 verification sessions.')}
                  </p>
                </div>
              </div>
            </div>

            <Link
              to="/verify"
              className="mt-4 flex items-center justify-between gap-3 p-4 rounded-xl bg-white border border-slate-200 hover:border-primary-400 group"
            >
              <span className="flex items-center gap-3">
                <span className="w-10 h-10 rounded-full bg-green-50 text-green-700 flex items-center justify-center">
                  <FiSearch className="w-5 h-5" />
                </span>
                <span>
                  <span className="block text-sm font-bold text-slate-900">{t('login.publicTitle', 'Citizen / trader? Verify a certificate')}</span>
                  <span className="block text-xs text-slate-500">{t('login.publicSub', 'No login needed — scan the QR or enter the certificate number')}</span>
                </span>
              </span>
              <FiArrowRight className="w-4 h-4 text-slate-400 group-hover:text-primary-700" />
            </Link>
          </div>
        </div>
      </div>
      <div className="bg-navy text-slate-400 text-[11px] text-center py-3 px-4">
        © {new Date().getFullYear()} {t('footer.owner', 'Content owned by the Department of Legal Metrology.')} · {t('footer.sih', 'Built for Smart India Hackathon 2026')}
      </div>
    </div>
  );
}
