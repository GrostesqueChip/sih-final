import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import QRCode from 'qrcode';
import {
  FiDownload,
  FiExternalLink,
  FiCopy,
  FiArrowLeft,
  FiFileText,
  FiShield,
  FiCheckCircle,
  FiXCircle,
  FiPrinter,
  FiLock,
} from 'react-icons/fi';

import apiClient from '../../hooks/useApi';
import StatusBadge from '../../components/shared/StatusBadge';
import LoadingSpinner from '../../components/shared/LoadingSpinner';
import ErrorEnvelopeChart from '../../components/charts/ErrorEnvelopeChart';
import PdfPreview from '../../components/shared/PdfPreview';
import { formatDate, formatDateTime, classLabel, verificationTypeLabel, TEST_MODULES, moduleTitle } from '../../utils/format';
import { finding } from '../tests/TestSessionDetailPage';

function usePdf(sessionId, kind, enabled) {
  const [url, setUrl] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => {
    if (!enabled) return undefined;
    let revoked = null;
    let alive = true;
    setUrl(null);
    setError(null);
    apiClient
      .get(`/reports/${sessionId}/${kind}`, { responseType: 'blob' })
      .then((res) => {
        if (!alive) return;
        revoked = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
        setUrl(revoked);
      })
      .catch(() => alive && setError(true));
    return () => {
      alive = false;
      if (revoked) URL.revokeObjectURL(revoked);
    };
  }, [sessionId, kind, enabled]);
  return { url, error };
}

export default function ReportPage() {
  const { t } = useTranslation();
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const [tab, setTab] = useState('certificate');
  const [qr, setQr] = useState('');

  const { data: s, isLoading } = useQuery({
    queryKey: ['test-session', sessionId],
    queryFn: async () => (await apiClient.get(`/tests/${sessionId}`)).data?.data,
  });

  const sealed = s && (s.status === 'COMPLETED' || s.status === 'FAILED') && s.verificationSeal;
  const cert = usePdf(sessionId, 'certificate', Boolean(sealed));
  const sheet = usePdf(sessionId, 'datasheet', Boolean(sealed) && tab === 'datasheet');
  const verifyUrl = s ? `${window.location.origin}/verify/${encodeURIComponent(s.certificateNo)}?seal=${s.verificationSeal || ''}` : '';

  useEffect(() => {
    if (verifyUrl) QRCode.toDataURL(verifyUrl, { margin: 1, width: 360, color: { dark: '#0B2A4A', light: '#FFFFFF' } }).then(setQr).catch(() => {});
  }, [verifyUrl]);

  const weighing = useMemo(() => s?.testResults?.find((r) => r.testType === 'WEIGHING_PERFORMANCE')?.data?.points || [], [s]);

  if (isLoading) return <LoadingSpinner message={t('common.loading', 'Loading…')} />;
  if (!s) return <div className="bg-white border border-slate-200 rounded-xl p-10 text-center">{t('detail.notFound', 'Session not found')}</div>;

  if (!sealed) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-10 text-center max-w-xl mx-auto">
        <FiLock className="w-8 h-8 text-slate-400 mx-auto" />
        <h2 className="mt-3 text-lg font-bold text-slate-900">{t('report.notSealed', 'Certificate not issued yet')}</h2>
        <p className="text-sm text-slate-600 mt-1">{t('report.notSealedMsg', 'A certificate is generated only after all six tests are recorded and the session is finalised and sealed.')}</p>
        <button type="button" onClick={() => navigate(`/tests/${s.id}`)} className="mt-5 h-10 px-4 rounded-md bg-navy text-white text-sm font-bold">{t('report.goSession', 'Go to session')}</button>
      </div>
    );
  }

  const pass = s.overallResult === 'PASS';
  const inst = s.instrument || {};
  const validUntil = pass ? new Date(new Date(s.completedAt).setFullYear(new Date(s.completedAt).getFullYear() + 1)) : null;
  const active = tab === 'certificate' ? cert : sheet;
  const fileName = `${tab === 'certificate' ? 'Certificate' : 'Datasheet'}_${s.certificateNo}.pdf`;

  const download = () => {
    if (!active.url) return;
    const a = document.createElement('a');
    a.href = active.url;
    a.download = fileName;
    a.click();
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-3">
        <div>
          <button type="button" onClick={() => navigate(`/tests/${s.id}`)} className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-navy mb-1">
            <FiArrowLeft className="w-3.5 h-3.5" /> {t('report.backSession', 'Back to session')}
          </button>
          <h1 className="text-2xl font-extrabold text-navy flex flex-wrap items-center gap-3">
            {pass ? t('report.certTitle', 'Certificate of Verification') : t('report.rejTitle', 'Certificate of Rejection')}
            <StatusBadge status={s.overallResult} size="md" />
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            <span className="font-mono font-semibold">{s.certificateNo}</span> · {inst.name} · {verificationTypeLabel(s.verificationType)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a href={verifyUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 h-10 px-4 rounded-md border border-slate-300 bg-white text-sm font-semibold text-slate-700 hover:bg-slate-50">
            <FiExternalLink className="w-4 h-4" /> {t('report.public', 'Public verification page')}
          </a>
          <button type="button" onClick={download} disabled={!active.url} className="inline-flex items-center gap-2 h-10 px-4 rounded-md bg-navy text-white text-sm font-bold hover:bg-navy-light disabled:opacity-50">
            <FiDownload className="w-4 h-4" /> {t('report.download', 'Download PDF')}
          </button>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[1fr_360px] items-start">
        {/* PDF viewer */}
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-200 px-2">
            <div className="flex" role="tablist">
              {[
                ['certificate', t('report.tabCert', 'Certificate (1 page)')],
                ['datasheet', t('report.tabSheet', 'Technical data sheet')],
              ].map(([k, label]) => (
                <button
                  key={k}
                  type="button"
                  role="tab"
                  aria-selected={tab === k}
                  onClick={() => setTab(k)}
                  className={`px-4 h-12 text-sm font-semibold border-b-2 -mb-px inline-flex items-center gap-2 ${tab === k ? 'border-saffron-500 text-navy' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
                >
                  <FiFileText className="w-4 h-4" /> {label}
                </button>
              ))}
            </div>
            {active.url && (
              <button type="button" onClick={() => window.open(active.url, '_blank')} className="mr-2 inline-flex items-center gap-1.5 h-8 px-3 rounded-md text-xs font-semibold text-slate-600 hover:bg-slate-100">
                <FiPrinter className="w-3.5 h-3.5" /> {t('report.openPrint', 'Open / print')}
              </button>
            )}
          </div>
          <div className="bg-slate-600 max-h-[1000px] min-h-[600px] overflow-y-auto">
            {active.error ? (
              <div className="h-[600px] flex items-center justify-center text-white text-sm">{t('report.pdfFail', 'Could not generate the PDF.')}</div>
            ) : !active.url ? (
              <div className="h-[600px] flex flex-col items-center justify-center text-slate-200 text-sm gap-3">
                <span className="w-8 h-8 border-2 border-white border-t-transparent rounded-full animate-spin" />
                {t('report.generating', 'Generating signed PDF…')}
              </div>
            ) : (
              <PdfPreview url={active.url} className="min-h-[600px]" />
            )}
          </div>
        </div>

        {/* Side */}
        <div className="space-y-4">
          <div className={`rounded-xl border p-5 ${pass ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
            <div className="flex items-center gap-3">
              {pass ? <FiCheckCircle className="w-8 h-8 text-green-700" /> : <FiXCircle className="w-8 h-8 text-red-700" />}
              <div>
                <div className={`font-extrabold ${pass ? 'text-green-900' : 'text-red-900'}`}>{pass ? t('report.approved', 'Approved for use in trade') : t('report.rejected', 'Rejected — not fit for trade')}</div>
                <div className="text-xs text-slate-600">{pass ? t('report.validTill', 'Valid until {{d}}', { d: formatDate(validUntil) }) : t('report.sealedAgainst', 'Sealed against commercial use')}</div>
              </div>
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-2 text-xs">
              <div className="p-2 rounded bg-white/70"><dt className="text-slate-500">{t('report.verifiedOn', 'Verified on')}</dt><dd className="font-bold">{formatDate(s.completedAt)}</dd></div>
              <div className="p-2 rounded bg-white/70"><dt className="text-slate-500">{t('table.classShort', 'Class')}</dt><dd className="font-bold">{classLabel(inst.accuracyClass)}</dd></div>
              <div className="p-2 rounded bg-white/70 col-span-2"><dt className="text-slate-500">{t('table.officer', 'Officer')}</dt><dd className="font-bold">{s.conductedBy?.name}</dd></div>
            </dl>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <div className="flex items-center gap-2 text-sm font-bold text-slate-900"><FiShield className="w-4 h-4 text-primary-700" /> {t('report.sealTitle', 'Tamper-evident seal & QR')}</div>
            <div className="mt-3 flex gap-4 items-center">
              {qr && <img src={qr} alt={t('report.qrAlt', 'QR code linking to the public verification page')} className="w-28 h-28 border border-slate-200 rounded" />}
              <p className="text-xs text-slate-600">{t('report.qrText', 'Scanning this code opens the public registry, which re-computes the HMAC seal and confirms the certificate is genuine.')}</p>
            </div>
            <div className="mt-3 p-2.5 rounded bg-slate-50 border border-slate-200 font-mono text-[10.5px] text-slate-700 break-all">{s.verificationSeal}</div>
            <div className="mt-1 text-[11px] text-slate-500">{t('report.sealedAt', 'Sealed {{d}}', { d: formatDateTime(s.sealedAt || s.completedAt) })}</div>
            <button
              type="button"
              onClick={() => navigator.clipboard?.writeText(verifyUrl).then(() => toast.success(t('report.copied', 'Verification link copied')))}
              className="mt-3 w-full inline-flex items-center justify-center gap-2 h-9 rounded-md border border-slate-300 text-xs font-bold text-slate-700 hover:bg-slate-50"
            >
              <FiCopy className="w-3.5 h-3.5" /> {t('report.copy', 'Copy verification link')}
            </button>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-100 text-sm font-bold text-slate-900">{t('report.results', 'Test results')}</div>
            <ul className="divide-y divide-slate-100">
              {TEST_MODULES.map((m) => {
                const r = s.testResults?.find((x) => x.testType === m.type);
                return (
                  <li key={m.type} className="px-5 py-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[13px] font-semibold text-slate-800">{moduleTitle(m.type)}</span>
                      <StatusBadge status={r?.result} size="xs" />
                    </div>
                    <div className="text-[11px] font-mono text-slate-500 mt-0.5">{finding(m.type, r?.calculations, inst)}</div>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      </div>

      {weighing.length > 0 && (
        <ErrorEnvelopeChart
          points={weighing}
          instrument={{ ...inst, verificationScaleInterval_e: inst.verificationInterval, actualScaleInterval_d: inst.actualInterval }}
          isInService={s.verificationType === 'INSPECTION'}
          title={t('report.chartTitle', 'Error curve vs. maximum permissible error — {{n}}', { n: s.certificateNo })}
        />
      )}
    </div>
  );
}
