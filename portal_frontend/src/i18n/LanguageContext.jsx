/**
 * FILE: src/i18n/LanguageContext.jsx
 * Portal language (9 Nov 2026): English by default, Kiswahili on request. The choice is kept per browser
 * (a convenience only) and applies to every page that reads useLanguage(). Report documents keep their
 * own SW | EN switch inside the report.
 */
import {createContext, useCallback, useContext, useEffect, useMemo, useState} from 'react';
import {translate} from './dictionary.js';

const KEY = 'viwanda.lang';
const read = () => { try { return localStorage.getItem(KEY) === 'sw' ? 'sw' : 'en'; } catch { return 'en'; } };
const LanguageContext = createContext({lang: 'en', setLang: () => {}, t: text => text, pick: (en) => en});

export function LanguageProvider({children}) {
  const [lang, setLangState] = useState(read);
  const setLang = useCallback(next => {
    const value = next === 'sw' ? 'sw' : 'en';
    setLangState(value);
    try { localStorage.setItem(KEY, value); } catch { /* private window: keep for this visit only */ }
  }, []);
  useEffect(() => { document.documentElement.lang = lang; }, [lang]);
  const value = useMemo(() => ({
    lang, setLang,
    /** Dictionary word (menu, breadcrumb, shell). */
    t: text => translate(text, lang),
    /** Inline pair for page text: pick('English', 'Kiswahili'). */
    pick: (en, sw) => (lang === 'sw' ? sw : en),
  }), [lang, setLang]);
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export const useLanguage = () => useContext(LanguageContext);
