// Paiement mobile money par code marchand (USSD). Les codes viennent du serveur (GET /api/payment,
// réglages sur Render) avec MONTANT à la place du montant : jamais écrits en dur dans le site.
import { useEffect, useState } from 'react';
import { api } from '../api/client.js';

export const MOBILE_MONEY = [
  { id: 'ORANGE_MONEY', logo: 'OM', cls: 'logo-om', label: 'Orange Money' },
  { id: 'MOOV_MONEY', logo: 'MV', cls: 'logo-mv', label: 'Moov Money' },
  { id: 'TELECEL_MONEY', logo: 'TM', cls: 'logo-tm', label: 'Telecel Money' },
];
export const METHOD_LABEL = Object.fromEntries(MOBILE_MONEY.map((m) => [m.id, m.label]));

// « *144*10*66534483*MONTANT# » + 5500 -> « *144*10*66534483*5500# »
export const fillCode = (template, amount) => template.replaceAll('MONTANT', String(Math.round(amount)));

// Ouvre le clavier du téléphone avec le code déjà tapé (# doit être écrit %23 dans un lien)
export const ussdHref = (code) => `tel:${code.replace(/#/g, '%23')}`;

// Chargés une fois par visite
let cache = null;
export function usePaymentCodes() {
  const [state, setState] = useState(() => (cache ? { data: cache } : { loading: true }));
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (cache) return undefined;
    let alive = true;
    api.getPayment().then(
      (data) => {
        cache = data;
        if (alive) setState({ data });
      },
      (error) => alive && setState({ error }),
    );
    return () => {
      alive = false;
    };
  }, [attempt]);
  return { ...state, retry: () => (setState({ loading: true }), setAttempt((n) => n + 1)) };
}

// Copie dans le presse-papiers (iPhone : le clavier ne peut pas toujours être ouvert avec le code)
export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const t = document.createElement('textarea');
    t.value = text;
    t.setAttribute('readonly', '');
    t.style.position = 'fixed';
    t.style.opacity = '0';
    document.body.appendChild(t);
    t.select();
    t.setSelectionRange(0, text.length);
    const ok = document.execCommand('copy');
    t.remove();
    return ok;
  }
}
