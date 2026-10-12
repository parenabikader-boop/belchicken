// Lot 8 : langue du site client (français par défaut, anglais si le Patron allume « Site en anglais »).
// Le bouton FR / EN n'existe que si GET /api/site répond { anglais: true }. Le choix du client est gardé
// dans son téléphone pour la prochaine visite. Sans LanguageProvider (espace équipe), tout reste en français.
import { createContext, Fragment, useContext, useEffect, useMemo, useState } from 'react';
import { api } from '../api/client.js';
import fr from './fr.js';
import en from './en.js';

const DICTS = { fr, en };
const CHOICE_KEY = 'belchicken.langue'; // 'fr' | 'en' : choix du client
const ENABLED_KEY = 'belchicken.anglais'; // '1' | '0' : dernière réponse de /api/site (évite un clignotement)

function read(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function write(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* navigation privée : le choix vaut pour cette visite seulement */
  }
}

const LangContext = createContext({ lang: 'fr', t: fr, enabled: false, setLang: () => {} });

// Demandé une fois par visite
let siteRequest = null;

export function LanguageProvider({ children }) {
  const [enabled, setEnabled] = useState(() => read(ENABLED_KEY) === '1');
  const [chosen, setChosen] = useState(() => (read(CHOICE_KEY) === 'en' ? 'en' : 'fr'));

  useEffect(() => {
    let alive = true;
    (siteRequest ||= api.getSite().catch(() => null)).then((site) => {
      if (!alive || !site) return; // serveur injoignable : on garde la dernière réponse connue
      setEnabled(site.anglais === true);
      write(ENABLED_KEY, site.anglais === true ? '1' : '0');
    });
    return () => {
      alive = false;
    };
  }, []);

  const lang = enabled && chosen === 'en' ? 'en' : 'fr';
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const value = useMemo(
    () => ({
      lang,
      t: DICTS[lang],
      enabled,
      setLang: (l) => {
        setChosen(l);
        write(CHOICE_KEY, l);
      },
    }),
    [lang, enabled],
  );
  return <LangContext.Provider value={value}>{children}</LangContext.Provider>;
}

export const useLang = () => useContext(LangContext);
export const useT = () => useContext(LangContext).t;

// Bouton FR / EN (rien quand le réglage est éteint : le site reste exactement comme avant)
export function LangSwitch({ className }) {
  const { lang, enabled, setLang, t } = useLang();
  if (!enabled) return null;
  return (
    <div className={`lang-sw${className ? ` ${className}` : ''}`} role="group" aria-label={t.lang.group}>
      <button type="button" lang="fr" aria-pressed={lang === 'fr'} title="Français" onClick={() => setLang('fr')}>FR</button>
      <button type="button" lang="en" aria-pressed={lang === 'en'} title="English" onClick={() => setLang('en')}>EN</button>
    </div>
  );
}

// Texte avec **gras** et {valeurs} : <Rich text={t.x.y} amount={…} />. Les valeurs (noms, montants, éléments)
// ne sont jamais relues comme du gras.
export function Rich({ text, ...values }) {
  return text.split(/\*\*(.+?)\*\*/).map((part, i) => {
    const filled = part.split(/(\{\w+\})/).map((p, j) => {
      const m = /^\{(\w+)\}$/.exec(p);
      return <Fragment key={j}>{m ? values[m[1]] : p}</Fragment>;
    });
    return i % 2 ? <b key={i}>{filled}</b> : <Fragment key={i}>{filled}</Fragment>;
  });
}
