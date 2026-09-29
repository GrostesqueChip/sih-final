import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import en from './locales/en.json';
import hi from './locales/hi.json';

const resources = {
  en: { translation: en },
  hi: { translation: hi },
};

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: 'en',
    supportedLngs: ['en', 'hi'],
    nonExplicitSupportedLngs: true,
    interpolation: {
      escapeValue: false, // React already escapes values
    },
    keySeparator: false,
    returnNull: false,
    returnEmptyString: false,
    detection: {
      // Default to English for first-time visitors; remember an explicit choice.
      order: ['localStorage'],
      caches: ['localStorage'],
    },
  });

// Keep <html lang="…"> in sync with the active language (WCAG 3.1.1). The
// static lang="en" in index.html would otherwise misrepresent Hindi/Tamil/
// Bengali content to screen readers and translation tools.
function syncHtmlLang(lng) {
  if (typeof document !== 'undefined' && lng) {
    document.documentElement.setAttribute('lang', lng);
  }
}
syncHtmlLang(i18n.resolvedLanguage || i18n.language);
i18n.on('languageChanged', syncHtmlLang);

export default i18n;
