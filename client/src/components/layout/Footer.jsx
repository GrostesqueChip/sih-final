import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FiExternalLink, FiX } from 'react-icons/fi';
import StateEmblem, { TricolorBar } from '../common/StateEmblem';

const BUILD_TS = typeof __BUILD_TIMESTAMP__ !== 'undefined' ? __BUILD_TIMESTAMP__ : null;

const POLICIES = {
  terms: {
    en: 'Terms & Conditions',
    hi: 'नियम और शर्तें',
    body: 'This portal is for authorised officers of the Department of Legal Metrology and for public verification of certificates. Tampering with a verification seal, a stamped instrument or a digital certificate is an offence under Sections 25, 33 and 45 of the Legal Metrology Act, 2009.',
  },
  privacy: {
    en: 'Privacy Policy',
    hi: 'गोपनीयता नीति',
    body: 'Only the data needed to identify a weighing instrument, its owner and the verifying officer is recorded. The public verification page shows no personal contact details. Access to the officer portal is logged in an append-only audit trail.',
  },
  hyperlink: {
    en: 'Hyperlinking Policy',
    hi: 'हाइपरलिंक नीति',
    body: 'Links to external Government websites open in a new tab. The Department is not responsible for the content of external sites. Other websites may link to the public verification page without prior permission.',
  },
  accessibility: {
    en: 'Accessibility Statement',
    hi: 'सुगम्यता विवरण',
    body: 'The portal follows the Guidelines for Indian Government Websites (GIGW 3.0) and WCAG 2.1 AA: keyboard navigation, skip links, adjustable text size, a high-contrast mode, text alternatives for images and a Hindi interface.',
  },
  help: {
    en: 'Help',
    hi: 'सहायता',
    body: 'Officers: start a verification from “Start Verification”, record the six OIML R 76 tests (readings can be captured from the connected indicator), then finalise to seal and issue the certificate. Citizens: scan the QR code on any certificate or enter its number on the public verification page.',
  },
};

export default function Footer() {
  const { t, i18n } = useTranslation();
  const [modal, setModal] = useState(null);
  const hi = i18n.language === 'hi';
  const updated = new Date(BUILD_TS || Date.now()).toLocaleDateString(hi ? 'hi-IN' : 'en-IN', { day: '2-digit', month: 'long', year: 'numeric' });

  const links = [
    { href: 'https://consumeraffairs.nic.in/', en: 'Department of Consumer Affairs', hi: 'उपभोक्ता मामले विभाग' },
    { href: 'https://www.indiacode.nic.in/', en: 'Legal Metrology Act, 2009 (India Code)', hi: 'विधिक माप विज्ञान अधिनियम, 2009' },
    { href: 'https://www.oiml.org/en/publications/recommendations', en: 'OIML Recommendations (R 76)', hi: 'ओआईएमएल अनुशंसाएँ (R 76)' },
    { href: 'https://consumerhelpline.gov.in/', en: 'National Consumer Helpline — 1915', hi: 'राष्ट्रीय उपभोक्ता हेल्पलाइन — 1915' },
    { href: 'https://www.india.gov.in/', en: 'National Portal of India', hi: 'भारत का राष्ट्रीय पोर्टल' },
  ];

  return (
    <footer className="no-print bg-navy text-slate-300 mt-auto">
      <TricolorBar thickness={3} />
      <div className="max-w-[1600px] mx-auto px-5 sm:px-8 py-8 grid gap-8 md:grid-cols-12">
        <div className="md:col-span-5 flex gap-4">
          <StateEmblem light height={64} />
          <div className="text-sm leading-relaxed">
            <div className="font-hindi text-white font-bold text-base">विधिक माप विज्ञान विभाग</div>
            <div className="text-white font-bold uppercase tracking-wide text-[13px]">Department of Legal Metrology</div>
            <div className="text-xs text-slate-400 mt-0.5">{t('gov.ministry', 'Ministry of Consumer Affairs, Food & Public Distribution')}</div>
            <p className="text-xs text-slate-400 mt-3 max-w-md">
              {t(
                'footer.about',
                'NAWI-ReportPro digitises verification of non-automatic weighing instruments under OIML R 76 — from field readings to a sealed, QR-verifiable certificate.'
              )}
            </p>
          </div>
        </div>

        <div className="md:col-span-4">
          <div className="text-xs font-bold uppercase tracking-[0.14em] text-saffron-500 mb-3">{t('footer.links', 'Important links')}</div>
          <ul className="space-y-1.5 text-[13px]">
            {links.map((l) => (
              <li key={l.href}>
                <a href={l.href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 hover:text-white hover:underline">
                  {hi ? l.hi : l.en}
                  <FiExternalLink className="w-3 h-3 opacity-60" />
                </a>
              </li>
            ))}
          </ul>
        </div>

        <div className="md:col-span-3">
          <div className="text-xs font-bold uppercase tracking-[0.14em] text-saffron-500 mb-3">{t('footer.verify', 'Verify a certificate')}</div>
          <p className="text-[13px] text-slate-400 mb-3">
            {t('footer.verifyText', 'Traders and citizens can check any certificate by scanning its QR code or entering its number.')}
          </p>
          <a href="/verify" target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 h-9 px-4 rounded-md bg-white text-navy text-sm font-bold hover:bg-saffron-50">
            {t('footer.verifyBtn', 'Open public verification')}
            <FiExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      </div>

      <div className="border-t border-white/10">
        <div className="max-w-[1600px] mx-auto px-5 sm:px-8 py-4 flex flex-col lg:flex-row gap-3 lg:items-center lg:justify-between text-[11.5px]">
          <nav className="flex flex-wrap gap-x-4 gap-y-1">
            {Object.entries(POLICIES).map(([k, p]) => (
              <button key={k} type="button" onClick={() => setModal(k)} className="hover:text-white hover:underline">
                {hi ? p.hi : p.en}
              </button>
            ))}
          </nav>
          <div className="text-slate-400">
            {t('footer.owner', 'Content owned by the Department of Legal Metrology.')} {t('footer.updated', 'Last updated')}: {updated} ·{' '}
            {t('footer.sih', 'Built for Smart India Hackathon 2026')}
          </div>
        </div>
      </div>

      {modal && (
        <div className="fixed inset-0 z-[80] bg-slate-900/60 flex items-center justify-center p-4" onClick={() => setModal(null)}>
          <div className="bg-white rounded-lg shadow-2xl max-w-lg w-full overflow-hidden" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            <TricolorBar thickness={3} />
            <div className="p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-lg font-bold text-navy">{POLICIES[modal].en}</h2>
                  <div className="font-hindi text-sm text-slate-500">{POLICIES[modal].hi}</div>
                </div>
                <button type="button" onClick={() => setModal(null)} className="p-1 rounded hover:bg-slate-100 text-slate-500" aria-label="Close">
                  <FiX className="w-5 h-5" />
                </button>
              </div>
              <p className="mt-3 text-sm text-slate-700 leading-relaxed">{POLICIES[modal].body}</p>
            </div>
          </div>
        </div>
      )}
    </footer>
  );
}
