// Réglages publics du site client (GET /api/site : { anglais, menuBorne }), demandés une seule fois par visite et
// partagés par la langue (lot 8, i18n/index.jsx) et le choix du menu (lot 11, site/SiteFrame.jsx).
import { useEffect, useState } from 'react';
import { api } from '../api/client.js';
import { kioskMenuState } from './site-choice.js';
import { simpleOrderState } from './simple-order.js';

let siteRequest = null;

// null si le serveur est injoignable
export const loadSite = () => (siteRequest ||= api.getSite().catch(() => null));

export function readStored(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
export function writeStored(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* navigation privée : valable pour cette visite seulement */
  }
}

const KIOSK_KEY = 'belchicken.menuBorne'; // '1' | '0' : dernière réponse de /api/site (évite un clignotement)

// Lot 11 : true = menu façon borne sur /menu, false = menu actuel, null = réponse attendue (première visite)
export function useKioskMenu() {
  const [state, setState] = useState({ answer: null, done: false });
  useEffect(() => {
    let alive = true;
    loadSite().then((site) => {
      if (!alive) return;
      if (site) writeStored(KIOSK_KEY, site.menuBorne === true ? '1' : '0');
      setState({ answer: site, done: true });
    });
    return () => {
      alive = false;
    };
  }, []);
  return kioskMenuState(readStored(KIOSK_KEY), state.answer, state.done);
}

const SIMPLE_KEY = 'belchicken.commandeSimple'; // '1' | '0' : dernière réponse de /api/site

// Lot « Commande simplifiée » : true = parcours court (panneau sur le menu, une seule page de commande), false = le
// site actuel. Réponse inconnue (première visite, serveur injoignable) : la dernière gardée, sinon le site actuel.
export function useSimpleOrder() {
  const [state, setState] = useState({ answer: null, done: false });
  useEffect(() => {
    let alive = true;
    loadSite().then((site) => {
      if (!alive) return;
      if (site) writeStored(SIMPLE_KEY, site.commandeSimple === true ? '1' : '0');
      setState({ answer: site, done: true });
    });
    return () => {
      alive = false;
    };
  }, []);
  return simpleOrderState(readStored(SIMPLE_KEY), state.answer, state.done);
}
