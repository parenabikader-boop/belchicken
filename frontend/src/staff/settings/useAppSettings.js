import { useEffect, useState } from 'react';
import { staffApi } from '../../api/client.js';

// Réglages du logiciel (parcours court…), relus à chaque ouverture de page. loaded = réponse reçue. Si la
// lecture échoue : tout éteint, c'est-à-dire le fonctionnement habituel.
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
      () => alive && setSettings({ shortFlow: false, agentOrders: false, newOrdersPage: false, failed: true }),
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
