import { useEffect, useState } from 'react';
import { canPromptInstall, isIos, isStandalone, justInstalled, promptInstall, subscribeInstall } from '../pwa.js';

// Bandeau discret « Installer l'application », jamais bloquant :
// - Android : bouton qui ouvre la fenêtre d'installation du téléphone ;
// - iPhone : petit guide « Partager, puis Sur l'écran d'accueil ».
// Refermé, il ne revient pas avant quelques jours. Jamais affiché dans l'application installée.
const PAUSE_DAYS = 5;

const APPS = {
  client: { name: 'Belchicken', icon: '/icons/client-192.png', text: 'Commandez depuis votre écran d’accueil' },
  equipe: { name: 'Belchicken Équipe', icon: '/icons/equipe-192.png', text: 'L’espace équipe en un geste' },
};

const storageKey = (app) => `bc-install-ferme-${app}`;

function recentlyClosed(app) {
  try {
    const at = Number(localStorage.getItem(storageKey(app)));
    return at > 0 && Date.now() - at < PAUSE_DAYS * 24 * 60 * 60 * 1000;
  } catch {
    return false;
  }
}

function rememberClosed(app) {
  try {
    localStorage.setItem(storageKey(app), String(Date.now()));
  } catch {
    // navigation privée : le bandeau reviendra simplement à la prochaine visite
  }
}

export default function InstallBanner({ app = 'client' }) {
  const [, refresh] = useState(0);
  const [closed, setClosed] = useState(() => recentlyClosed(app));
  const [guide, setGuide] = useState(false);

  useEffect(() => subscribeInstall(() => refresh((n) => n + 1)), []);

  if (closed || isStandalone() || justInstalled()) return null;
  const android = canPromptInstall();
  const ios = !android && isIos();
  if (!android && !ios) return null;

  const { name, icon, text } = APPS[app];

  const close = () => {
    rememberClosed(app);
    setClosed(true);
  };

  const install = async () => {
    if (ios) {
      setGuide((g) => !g);
      return;
    }
    const accepted = await promptInstall();
    if (!accepted) close();
  };

  return (
    <aside className="install" aria-label="Installer l'application">
      <div className="install-row">
        <img src={icon} alt="" width="44" height="44" />
        <div className="install-txt">
          <b>Installer l’application</b>
          <span><span className="install-name">{name}</span><span className="install-more"> · {text}</span></span>
        </div>
        <button type="button" className="install-go" onClick={install} aria-expanded={ios ? guide : undefined}>
          {ios ? 'Comment ?' : 'Installer'}
        </button>
        <button type="button" className="install-x" onClick={close} aria-label="Fermer">×</button>
      </div>
      {ios && guide && (
        <ol className="install-guide">
          <li>
            Touchez le bouton <b>Partager</b> <ShareIcon /> en bas de l’écran (ou en haut sur iPad).
          </li>
          <li>Faites défiler, puis touchez <b>Sur l’écran d’accueil</b>.</li>
          <li>Touchez <b>Ajouter</b> : l’icône {name} apparaît sur votre écran d’accueil.</li>
        </ol>
      )}
    </aside>
  );
}

// Icône « Partager » d'iPhone : un carré ouvert avec une flèche vers le haut
function ShareIcon() {
  return (
    <svg className="install-share" viewBox="0 0 24 24" width="18" height="18" aria-label="(carré avec une flèche vers le haut)" role="img">
      <path d="M12 3v12M7.5 7.5 12 3l4.5 4.5M8 11H6v10h12V11h-2" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
