import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import {
  FiSearch,
  FiCheckCircle,
  FiXCircle,
  FiAlertTriangle,
  FiShield,
  FiMapPin,
  FiUser,
  FiCalendar,
  FiPrinter,
  FiCopy,
  FiLogIn,
  FiPhoneCall,
  FiHelpCircle,
} from 'react-icons/fi';
import toast from 'react-hot-toast';

import { verifyCertificate } from '../../services/publicApi';
import { getSampleCertificates } from '../../services/publicApi';
import { GovStrip, DepartmentIdentity } from '../../components/layout/TopBar';
import { TricolorBar } from '../../components/common/StateEmblem';
import ErrorEnvelopeChart from '../../components/charts/ErrorEnvelopeChart';
import { formatDate, formatDateTime, classLabel, typeLabel, verificationTypeLabel, moduleTitle, modulesFor } from '../../utils/format';

const STATUS = {
  VERIFIED_LEGAL: {
    tone: 'green',
    icon: FiCheckCircle,
    en: 'VALID — Approved for use in trade',
    hi: 'मान्य — व्यापार में उपयोग हेतु अनुमोदित',
    sub: 'This weighing instrument was verified and stamped by the Department of Legal Metrology.',
  },
  REJECTED: {
    tone: 'red',
    icon: FiXCircle,
    en: 'REJECTED — Not to be used for trade',
    hi: 'अस्वीकृत — व्यापार में उपयोग वर्जित',
    sub: 'The instrument failed verification. Weighing done on it cannot be relied upon.',
  },
  EXPIRED: {
    tone: 'amber',
    icon: FiAlertTriangle,
    en: 'EXPIRED — Re-verification overdue',
    hi: 'समाप्त — पुनः सत्यापन अपेक्षित',
    sub: 'The 12-month validity of this certificate has lapsed.',
  },
  TAMPERED: {
    tone: 'red',
    icon: FiAlertTriangle,
    en: 'NOT AUTHENTIC — Seal does not match',
    hi: 'अप्रामाणिक — मुहर मेल नहीं खाती',
    sub: 'The digital seal does not match the departmental record. The document may have been altered.',
  },
};

// A type evaluation test report (model approval) is authentic or not; it is
// never an approval for use in trade, so it gets its own wording.
const TE_STATUS = {
  PASS: {
    tone: 'green',
    icon: FiCheckCircle,
    en: 'AUTHENTIC — Type evaluation test report (sample met the recorded tests)',
    hi: 'प्रामाणिक — प्रकार मूल्यांकन परीक्षण रिपोर्ट',
    sub: 'Laboratory test report for model approval. It is not a verification certificate for use in trade.',
  },
  FAIL: {
    tone: 'red',
    icon: FiXCircle,
    en: 'AUTHENTIC — Type evaluation test report (sample failed a test)',
    hi: 'प्रामाणिक — प्रकार मूल्यांकन परीक्षण रिपोर्ट (परीक्षण में विफल)',
    sub: 'Laboratory test report for model approval. It is not a verification certificate for use in trade.',
  },
};

const TONE = {
  green: 'from-green-700 to-green-800',
  red: 'from-red-700 to-red-800',
  amber: 'from-amber-600 to-amber-700',
};

export default function PublicVerificationPage() {
  const { t, i18n } = useTranslation();
  const { certificateNo } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [input, setInput] = useState(certificateNo || '');
  const hi = i18n.language === 'hi';

  useEffect(() => setInput(certificateNo || ''), [certificateNo]);

  const { data, isFetching, error } = useQuery({
    queryKey: ['public-verify', certificateNo, params.get('seal')],
    enabled: Boolean(certificateNo),
    retry: false,
    queryFn: () => verifyCertificate(certificateNo, params.get('seal')),
  });
  const { data: samples = [] } = useQuery({ queryKey: ['public-samples'], queryFn: getSampleCertificates, staleTime: 60_000 });

  const submit = (e) => {
    e.preventDefault();
    const v = input.trim().toUpperCase();
    if (v) navigate(`/verify/${encodeURIComponent(v)}`);
  };

  const isTE = data?.reportType === 'TYPE_EVALUATION_REPORT';
  const meta = data
    ? isTE && data.status !== 'TAMPERED'
      ? TE_STATUS[data.overallResult === 'PASS' ? 'PASS' : 'FAIL']
      : STATUS[data.status] || STATUS.TAMPERED
    : null;
  const inst = data?.instrument || {};
  const weighing = data?.testResults?.find((r) => r.testType === 'WEIGHING_PERFORMANCE')?.data?.points || [];

  return (
    <div className="min-h-screen flex flex-col bg-[#F3F6FA]">
      <GovStrip />
      <header className="bg-white border-b border-slate-200 print:border-0">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-[76px] flex items-center justify-between gap-3">
          <DepartmentIdentity />
          <Link to="/login" className="no-print inline-flex items-center gap-2 h-9 px-3 rounded-md border border-slate-300 text-sm font-semibold text-slate-700 hover:bg-slate-50 shrink-0">
            <FiLogIn className="w-4 h-4" /> <span className="hidden sm:inline">{t('pub.officerLogin', 'Officer login')}</span>
          </Link>
        </div>
        <TricolorBar thickness={3} />
      </header>

      {/* Search hero */}
      <section className="relative overflow-hidden no-print">
        <img src="/assets/photos/lm-lab.jpg" alt="" className="absolute inset-0 w-full h-full object-cover object-[center_35%]" />
        <div className="absolute inset-0 bg-navy/85" />
        <div className="relative max-w-6xl mx-auto px-4 sm:px-6 py-10 sm:py-12 text-white">
          <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-saffron-500">{t('pub.eyebrow', 'Public verification portal · सार्वजनिक सत्यापन')}</div>
          <h1 className="mt-2 text-2xl sm:text-3xl font-extrabold max-w-2xl">{t('pub.title', 'Is this weighing scale legally verified?')}</h1>
          <p className="mt-2 text-slate-300 max-w-2xl text-sm">
            {t('pub.subtitle', 'Scan the QR code on the certificate or sticker, or type the certificate number. Anyone can check — no login required.')}
          </p>
          <form onSubmit={submit} className="mt-6 flex flex-col sm:flex-row gap-2 max-w-2xl">
            <label htmlFor="cert" className="sr-only">{t('pub.certNo', 'Certificate number')}</label>
            <input
              id="cert"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="NAWI-2026-000118"
              className="w-full sm:flex-1 h-12 px-4 rounded-md text-slate-900 font-mono text-base tracking-wide focus:outline-none focus:ring-4 focus:ring-saffron-500/50"
              autoComplete="off"
            />
            <button type="submit" className="h-12 px-6 rounded-md bg-saffron-500 hover:bg-saffron-600 text-navy-dark font-extrabold inline-flex items-center justify-center gap-2">
              <FiSearch className="w-5 h-5" /> {t('pub.verify', 'Verify')}
            </button>
          </form>
          {samples.length > 0 && (
            <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
              <span className="text-slate-400">{t('pub.try', 'Try a sample:')}</span>
              {samples.map((s) => (
                <button
                  key={s.certificateNo}
                  type="button"
                  onClick={() => navigate(`/verify/${s.certificateNo}`)}
                  className="font-mono px-2.5 py-1 rounded-full bg-white/10 hover:bg-white/20 border border-white/20"
                >
                  {s.certificateNo} <span className={s.result === 'PASS' ? 'text-green-300' : 'text-red-300'}>● {s.result === 'PASS' ? t('pub.valid', 'valid') : t('pub.rejectedShort', 'rejected')}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </section>

      <main id="main-content" className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-8">
        {!certificateNo && (
          <div className="grid md:grid-cols-3 gap-4">
            {[
              [FiSearch, t('pub.how1t', '1. Find the number'), t('pub.how1', 'The certificate number (e.g. NAWI-2026-000118) is printed on the certificate and the stamping sticker on the scale.')],
              [FiShield, t('pub.how2t', '2. We check the seal'), t('pub.how2', 'The portal recomputes the HMAC-SHA256 digital seal against the departmental register — altered copies are detected.')],
              [FiPhoneCall, t('pub.how3t', '3. Report a problem'), t('pub.how3', 'Short weighment or an unverified scale? Call the National Consumer Helpline 1915 or file a complaint online.')],
            ].map(([Icon, title, body]) => (
              <div key={title} className="bg-white border border-slate-200 rounded-xl p-5">
                <Icon className="w-6 h-6 text-primary-700" />
                <div className="mt-2 font-bold text-slate-900">{title}</div>
                <p className="text-sm text-slate-600 mt-1">{body}</p>
              </div>
            ))}
          </div>
        )}

        {certificateNo && isFetching && (
          <div className="bg-white border border-slate-200 rounded-xl p-10 text-center text-slate-600">
            <span className="inline-block w-8 h-8 border-2 border-primary-600 border-t-transparent rounded-full animate-spin" />
            <div className="mt-3 text-sm">{t('pub.checking', 'Checking the national register and verifying the digital seal…')}</div>
          </div>
        )}

        {certificateNo && !isFetching && error && (
          <div className="bg-white border-2 border-red-200 rounded-xl p-8 text-center">
            <FiXCircle className="w-10 h-10 text-red-600 mx-auto" />
            <h2 className="mt-3 text-xl font-extrabold text-red-800">{t('pub.notFound', 'No such certificate in the register')}</h2>
            <p className="text-sm text-slate-600 mt-1 max-w-lg mx-auto">
              {t('pub.notFoundMsg', '“{{n}}” was not issued by the Department. If a trader shows you this number, the certificate may be forged — please report it.', { n: certificateNo })}
            </p>
            <a href="https://consumerhelpline.gov.in/" target="_blank" rel="noreferrer" className="mt-4 inline-flex items-center gap-2 h-10 px-4 rounded-md bg-navy text-white text-sm font-bold">
              <FiPhoneCall className="w-4 h-4" /> {t('pub.report', 'Report to National Consumer Helpline (1915)')}
            </a>
          </div>
        )}

        {data && !isFetching && meta && (
          <div className="space-y-5">
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
              <div className={`bg-gradient-to-r ${TONE[meta.tone]} text-white p-6 flex flex-col md:flex-row md:items-center gap-4`}>
                <span className="w-14 h-14 rounded-full bg-white/15 flex items-center justify-center shrink-0">
                  <meta.icon className="w-8 h-8" />
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-xl sm:text-2xl font-extrabold">{hi ? meta.hi : meta.en}</div>
                  <div className="font-hindi text-sm opacity-90">{hi ? meta.en : meta.hi}</div>
                  <div className="text-sm opacity-90 mt-1">{meta.sub}</div>
                </div>
                <div className="bg-white/10 rounded-lg px-4 py-3 text-right shrink-0">
                  <div className="text-[10.5px] uppercase tracking-wide opacity-80">{t('pub.certNo', 'Certificate number')}</div>
                  <div className="font-mono text-lg font-bold">{data.certificateNo}</div>
                </div>
              </div>

              <div className="p-6 grid gap-6 lg:grid-cols-[1.2fr_1fr]">
                <div>
                  <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{t('pub.instrument', 'Weighing instrument')}</div>
                  <div className="text-lg font-bold text-navy mt-1">{inst.name}</div>
                  <div className="text-sm text-slate-600">{typeLabel(inst.type)} · {inst.model} · <span className="font-mono">S/N {inst.serialNumber}</span></div>
                  <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                    <div className="p-3 rounded-lg bg-slate-50"><dt className="text-xs text-slate-500">{t('table.class', 'Accuracy class')}</dt><dd className="font-bold">{classLabel(inst.accuracyClass)}</dd></div>
                    <div className="p-3 rounded-lg bg-slate-50"><dt className="text-xs text-slate-500">{t('pub.capacity', 'Capacity / interval')}</dt><dd className="font-bold">Max {inst.maxCapacity} {inst.unit} · e {inst.verificationInterval}</dd></div>
                    <div className="p-3 rounded-lg bg-slate-50 col-span-2"><dt className="text-xs text-slate-500 flex items-center gap-1"><FiMapPin className="w-3 h-3" /> {t('pub.where', 'Owner & place of use')}</dt><dd className="font-bold">{inst.ownerName || '—'}</dd><dd className="text-slate-600 text-[13px]">{inst.location}{inst.district && !inst.location?.includes(inst.district) ? `, ${inst.district}` : ''}</dd></div>
                  </dl>
                </div>
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div className="p-3 rounded-lg border border-slate-200"><dt className="text-xs text-slate-500 flex items-center gap-1"><FiCalendar className="w-3 h-3" /> {isTE ? t('pub.testedOn', 'Report sealed on') : t('pub.verifiedOn', 'Verified on')}</dt><dd className="font-bold">{formatDate(data.verificationDate)}</dd></div>
                    {isTE ? (
                      <div className="p-3 rounded-lg border border-slate-200"><dt className="text-xs text-slate-500">{t('pub.docType', 'Document')}</dt><dd className="font-bold">{t('pub.teReport', 'Type evaluation test report')}</dd></div>
                    ) : (
                      <div className="p-3 rounded-lg border border-slate-200"><dt className="text-xs text-slate-500">{t('pub.validUntil', 'Valid until')}</dt><dd className={`font-bold ${data.expiryDate ? '' : 'text-red-700'}`}>{data.expiryDate ? formatDate(data.expiryDate) : t('pub.notValid', 'Not valid')}</dd></div>
                    )}
                    <div className="p-3 rounded-lg border border-slate-200 col-span-2"><dt className="text-xs text-slate-500 flex items-center gap-1"><FiUser className="w-3 h-3" /> {t('pub.officer', 'Verifying officer')}</dt><dd className="font-bold">{data.verificationOfficer?.name || '—'}</dd><dd className="text-[13px] text-slate-600">{data.verificationOfficer?.designation} · {verificationTypeLabel(data.verificationType)}</dd></div>
                  </div>
                  <div className={`p-4 rounded-lg border ${data.authentic ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                    <div className={`flex items-center gap-2 font-bold text-sm ${data.authentic ? 'text-green-800' : 'text-red-800'}`}>
                      <FiShield className="w-4 h-4" />
                      {data.authentic ? t('pub.sealOk', 'Digital seal verified — record is genuine and unaltered') : t('pub.sealBad', 'Digital seal mismatch — do not trust this document')}
                    </div>
                    <div className="mt-1.5 font-mono text-[10.5px] text-slate-600 break-all">HMAC-SHA256 {data.sealSignature}</div>
                    <div className="text-[11px] text-slate-500 mt-1">{t('pub.checkedAt', 'Checked {{d}}', { d: formatDateTime(data.verifiedAt) })}</div>
                  </div>
                </div>
              </div>

              <div className="px-6 pb-6">
                <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-2">{t('pub.tests', 'OIML R 76 tests performed')}</div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  {modulesFor(data.verificationType).map((m) => {
                    const r = data.testResults?.find((x) => x.testType === m.type);
                    const ok = r?.result === 'PASS';
                    return (
                      <div key={m.type} className={`flex items-center gap-2 px-3 py-2 rounded-md border text-[13px] ${ok ? 'border-green-200 bg-green-50/60' : 'border-red-200 bg-red-50/60'}`}>
                        {ok ? <FiCheckCircle className="w-4 h-4 text-green-700 shrink-0" /> : <FiXCircle className="w-4 h-4 text-red-700 shrink-0" />}
                        <span className="font-semibold text-slate-800">{moduleTitle(m.type)}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex flex-wrap gap-2 no-print">
                <button type="button" onClick={() => window.print()} className="inline-flex items-center gap-2 h-9 px-3 rounded-md border border-slate-300 bg-white text-sm font-semibold text-slate-700 hover:bg-slate-50">
                  <FiPrinter className="w-4 h-4" /> {t('pub.print', 'Print verification slip')}
                </button>
                <button type="button" onClick={() => navigator.clipboard?.writeText(window.location.href).then(() => toast.success(t('report.copied', 'Verification link copied')))} className="inline-flex items-center gap-2 h-9 px-3 rounded-md border border-slate-300 bg-white text-sm font-semibold text-slate-700 hover:bg-slate-50">
                  <FiCopy className="w-4 h-4" /> {t('pub.copy', 'Copy link')}
                </button>
                <a href="https://consumerhelpline.gov.in/" target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 h-9 px-3 rounded-md border border-slate-300 bg-white text-sm font-semibold text-slate-700 hover:bg-slate-50">
                  <FiHelpCircle className="w-4 h-4" /> {t('pub.complain', 'Complain about this scale (1915)')}
                </a>
              </div>
            </div>

            {weighing.length > 0 && (
              <ErrorEnvelopeChart
                points={weighing}
                instrument={{ ...inst, verificationScaleInterval_e: inst.verificationInterval, actualScaleInterval_d: inst.actualInterval }}
                isInService={data.verificationType === 'INSPECTION'}
                showExport={false}
                title={t('pub.chart', 'Measured error vs. legal limit (weighing test)')}
              />
            )}
          </div>
        )}
      </main>

      <footer className="bg-navy text-slate-400 text-xs">
        <TricolorBar thickness={3} />
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-5 flex flex-col sm:flex-row gap-2 justify-between">
          <span>{t('footer.owner', 'Content owned by the Department of Legal Metrology.')} {t('gov.ministry', 'Ministry of Consumer Affairs, Food & Public Distribution')}</span>
          <span>Legal Metrology Act, 2009 · OIML R 76-1:2006</span>
        </div>
      </footer>
    </div>
  );
}
