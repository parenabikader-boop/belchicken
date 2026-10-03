// Application installable (PWA) : service worker et proposition d'installation.
// Le choix entre « Belchicken » et « Belchicken Équipe » se fait dans index.html.

// Service worker seulement sur le site en ligne : en local, il gênerait le rechargement de Vite
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}

// Android (Chrome) prévient une seule fois, souvent avant que la page soit affichée :
// on garde l'événement pour le bouton « Installer » du bandeau.
let deferredPrompt = null;
let installed = false;
const listeners = new Set();
const notify = () => listeners.forEach((fn) => fn());

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault(); // pas de fenêtre automatique : c'est notre bandeau qui la propose
  deferredPrompt = e;
  notify();
});

window.addEventListener('appinstalled', () => {
  installed = true;
  deferredPrompt = null;
  notify();
});

export function subscribeInstall(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export const canPromptInstall = () => Boolean(deferredPrompt);
export const justInstalled = () => installed;

// Ouvre la fenêtre d'installation d'Android. Renvoie true si la personne a accepté.
export async function promptInstall() {
  const e = deferredPrompt;
  if (!e) return false;
  deferredPrompt = null; // utilisable une seule fois
  e.prompt();
  const { outcome } = await e.userChoice.catch(() => ({ outcome: 'dismissed' }));
  notify();
  return outcome === 'accepted';
}

// Déjà ouverte comme application (icône de l'écran d'accueil) ?
export const isStandalone = () =>
  window.matchMedia?.('(display-mode: standalone)').matches ||
  window.matchMedia?.('(display-mode: fullscreen)').matches ||
  window.navigator.standalone === true;

// iPhone ou iPad (les iPad récents se présentent comme un Mac avec écran tactile)
export const isIos = () =>
  /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
