import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { isIos, isStandalone } from '../../pwa.js';

// Rappel en haut des commandes tant que les alertes ne sont pas activées sur ce téléphone.
// Refermé, il ne revient pas avant 7 jours.
const KEY = 'bc-alertes-rappel-ferme';
const PAUSE_MS = 7 * 24 * 60 * 60 * 1000;

function closedRecently() {
  try {
    return Date.now() - Number(localStorage.getItem(KEY)) < PAUSE_MS;
  } catch {
    return false;
  }
}

async function needsActivation() {
  if (isIos() && !isStandalone()) return true; // à installer d'abord : la page Alertes l'explique
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return false;
  if (Notification.permission === 'denied') return false;
  const reg = await navigator.serviceWorker.getRegistration();
  if (!reg) return false; // version de travail, sans service worker
  return !(await reg.pushManager.getSubscription());
}

export default function AlertsPrompt() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    let alive = true;
    if (!closedRecently()) needsActivation().then((v) => alive && setShow(v), () => {});
    return () => {
      alive = false;
    };
  }, []);

  if (!show) return null;

  const close = () => {
    try {
      localStorage.setItem(KEY, String(Date.now()));
    } catch {
      /* navigation privée */
    }
    setShow(false);
  };

  return (
    <div className="al-prompt">
      <span>🔔 Recevez une alerte sur ce téléphone à chaque nouvelle commande.</span>
      <Link className="al-prompt-go" to="/equipe/alertes">Activer</Link>
      <button type="button" className="al-prompt-x" onClick={close} aria-label="Fermer">×</button>
    </div>
  );
}
