import { useEffect, useState } from 'react';
import { staffApi } from '../../api/client.js';

// Réglages du logiciel (parcours court…), relus à chaque ouverture de page. loaded = réponse reçue. Si la
// lecture échoue : la dernière valeur lue, sinon tout éteint (le fonctionnement habituel).
let last = null;
// Composants affichés en même temps qu'un changement de réglage (barre de l'espace équipe) : prévenus tout de suite
const listeners = new Set();

export function useAppSettings() {
  const [settings, setSettings] = useState(last);
  useEffect(() => {
    listeners.add(setSettings);
    return () => listeners.delete(setSettings);
  }, []);
  useEffect(() => {
    let alive = true;
    staffApi.settings().then(
      (s) => {
        last = s;
        if (alive) setSettings(s);
      },
      // Relecture ratée : la dernière valeur connue reste (sinon la barre et les pages basculeraient en pleine
      // utilisation) ; seulement si rien n'a jamais été lu : tout éteint, le fonctionnement habituel
      () => alive && setSettings(last || { shortFlow: false, agentOrders: false, newOrdersPage: false, failed: true }),
    );
    return () => {
      alive = false;
    };
  }, []);
  return settings ? { ...settings, loaded: true } : { shortFlow: false, agentOrders: false, newOrdersPage: false, loaded: false };
}

export const rememberSettings = (s) => {
  last = s;
  for (const set of listeners) set(s);
};
