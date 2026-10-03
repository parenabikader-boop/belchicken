import { useCallback, useEffect, useState } from 'react';
import { staffApi } from '../../api/client.js';
import { isIos, isStandalone } from '../../pwa.js';

// Alertes de nouvelle commande sur ce téléphone (Web Push).
// État possible :
//   loading      vérification en cours
//   install-ios  iPhone : il faut d'abord installer l'application Belchicken Équipe
//   unsupported  navigateur incapable de recevoir des alertes
//   no-sw        service worker absent (site lancé avec npm run dev : alertes testables seulement en ligne)
//   server-off   clés VAPID absentes sur le serveur
//   denied       notifications refusées dans les réglages du téléphone
//   off          possible, mais pas activé sur ce téléphone
//   on           activé sur ce téléphone

const supported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

// Le service worker est enregistré au chargement de la page (pwa.js) : on l'attend un peu
async function registration() {
  if (!('serviceWorker' in navigator)) return null;
  const existing = await navigator.serviceWorker.getRegistration();
  if (!existing) return null;
  return Promise.race([navigator.serviceWorker.ready, new Promise((r) => setTimeout(() => r(null), 4000))]);
}

// Clé publique VAPID (base64 « url ») -> octets, format demandé par le navigateur
function keyBytes(base64) {
  const padded = (base64 + '='.repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
}

const sameKey = (sub, key) => {
  const current = sub.options?.applicationServerKey;
  if (!current) return true; // navigateur qui ne la donne pas : on suppose que c'est la bonne
  const a = new Uint8Array(current);
  const b = keyBytes(key);
  return a.length === b.length && a.every((v, i) => v === b[i]);
};

async function readState() {
  if (!supported()) return { state: isIos() && !isStandalone() ? 'install-ios' : 'unsupported' };
  const reg = await registration();
  if (!reg) return { state: 'no-sw' };
  const server = await staffApi.pushStatus();
  if (!server.enabled) return { state: 'server-off' };
  if (Notification.permission === 'denied') return { state: 'denied' };
  const sub = await reg.pushManager.getSubscription();
  if (!sub || Notification.permission !== 'granted' || !sameKey(sub, server.publicKey)) return { state: 'off', reg, server };
  // Le serveur a pu retirer ce téléphone (trop d'échecs) : on le lui redonne à chaque visite
  await staffApi.pushSubscribe(sub.toJSON()).catch(() => {});
  return { state: 'on', reg, server, sub };
}

export function usePush() {
  const [info, setInfo] = useState({ state: 'loading' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const refresh = useCallback(async () => {
    try {
      setInfo(await readState());
    } catch (e) {
      setInfo({ state: 'error' });
      setError(e.message);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const run = async (fn) => {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await fn();
    } catch (e) {
      setError(e.message || 'Une erreur est survenue. Réessayez.');
    }
    setBusy(false);
    await refresh();
  };

  const enable = () =>
    run(async () => {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        if (permission === 'default') throw new Error('Pour recevoir les alertes, touchez « Autoriser » quand le téléphone le demande.');
        return; // refusé : la page explique comment le réactiver
      }
      const { reg, server } = info.reg ? info : await readState();
      const old = await reg.pushManager.getSubscription();
      if (old && !sameKey(old, server.publicKey)) await old.unsubscribe(); // clés changées sur le serveur
      const sub = await reg.pushManager
        .subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(server.publicKey) })
        .catch((e) => {
          // Message du navigateur, en anglais : on le remplace
          throw new Error(
            e?.name === 'NotAllowedError'
              ? 'Le téléphone a refusé l’inscription aux alertes. Vérifiez que les notifications sont autorisées pour cette application, puis réessayez.'
              : 'L’inscription aux alertes a échoué. Vérifiez la connexion internet, puis réessayez.',
          );
        });
      await staffApi.pushSubscribe(sub.toJSON());
    });

  const disable = () =>
    run(async () => {
      const sub = info.sub || (await info.reg?.pushManager.getSubscription());
      if (!sub) return;
      await staffApi.pushUnsubscribe(sub.endpoint);
      await sub.unsubscribe();
      setMessage('Alertes coupées sur ce téléphone.');
    });

  const sendTest = () =>
    run(async () => {
      await staffApi.pushTest(info.sub.endpoint);
      setMessage('Notification d’essai envoyée : elle doit apparaître dans quelques secondes.');
    });

  return { state: info.state, busy, error, message, enable, disable, sendTest };
}
