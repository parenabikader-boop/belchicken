import { Link } from 'react-router-dom';
import { isIos } from '../../pwa.js';
import { usePush } from './push.js';

// /equipe/alertes : chaque membre de l'équipe active les alertes sur son propre téléphone
export default function AlertsPage() {
  const { state, busy, error, message, enable, disable, sendTest } = usePush();

  return (
    <>
      <div className="st-head">
        <h1 className="st-title">Alertes</h1>
      </div>
      <p className="st-muted" style={{ marginBottom: 18 }}>
        Une notification sur ce téléphone à chaque nouvelle commande, même quand l’application est fermée.
        Un appui ouvre la commande. À activer sur chaque téléphone de l’équipe.
      </p>

      <div className="st-box al-box">
        {error && <div className="alert err" role="alert"><span>{error}</span></div>}
        {message && <div className="alert ok" role="status"><span>{message}</span></div>}
        <Body state={state} busy={busy} enable={enable} disable={disable} sendTest={sendTest} />
      </div>
    </>
  );
}

function Body({ state, busy, enable, disable, sendTest }) {
  switch (state) {
    case 'loading':
      return <p className="st-muted">Vérification…</p>;

    case 'on':
      return (
        <>
          <p className="al-state on"><span className="al-dot" aria-hidden="true" />Les alertes sont activées sur ce téléphone.</p>
          <div className="al-actions">
            <button type="button" className="btn btn-p" onClick={sendTest} disabled={busy}>Envoyer une notification d’essai</button>
            <button type="button" className="btn btn-s" onClick={disable} disabled={busy}>Couper les alertes sur ce téléphone</button>
          </div>
        </>
      );

    case 'off':
      return (
        <>
          <p className="al-state"><span className="al-dot off" aria-hidden="true" />Les alertes ne sont pas activées sur ce téléphone.</p>
          <div className="al-actions">
            <button type="button" className="btn btn-p" onClick={enable} disabled={busy}>{busy ? 'Activation…' : 'Recevoir les alertes sur ce téléphone'}</button>
          </div>
          <p className="st-muted">Le téléphone va demander l’autorisation d’afficher des notifications : touchez « Autoriser ».</p>
        </>
      );

    case 'install-ios':
      return (
        <>
          <p className="al-state"><b>Sur iPhone, installez d’abord l’application Belchicken Équipe.</b></p>
          <ol className="al-steps">
            <li>Dans Safari, sur cette page, touchez le bouton <b>Partager</b> (le carré avec une flèche vers le haut).</li>
            <li>Touchez <b>Sur l’écran d’accueil</b>, puis <b>Ajouter</b>.</li>
            <li>Ouvrez <b>BC Équipe</b> depuis l’écran d’accueil, connectez-vous et revenez sur cette page <b>Alertes</b>.</li>
          </ol>
          <p className="st-muted">Apple n’autorise les notifications que dans l’application installée (iOS 16.4 ou plus récent).</p>
        </>
      );

    case 'denied':
      return (
        <>
          <p className="al-state"><b>Les notifications sont bloquées sur ce téléphone.</b></p>
          {isIos() ? (
            <p>Ouvrez <b>Réglages</b> › <b>Notifications</b> › <b>BC Équipe</b> et activez <b>Autoriser les notifications</b>, puis revenez ici.</p>
          ) : (
            <p>Touchez le cadenas ou ⋮ à côté de l’adresse (ou, dans l’application installée, appuyez longuement sur son icône › <b>Infos sur l’appli</b>) › <b>Notifications</b> › <b>Autoriser</b>, puis revenez ici.</p>
          )}
        </>
      );

    case 'server-off':
      return <p>Les alertes ne sont pas encore configurées sur le serveur (clés VAPID manquantes).</p>;

    case 'no-sw':
      return <p>Les alertes ne fonctionnent que sur le site en ligne, pas sur la version de travail (<code>npm run dev</code>).</p>;

    case 'unsupported':
      return <p>Ce navigateur ne peut pas recevoir d’alertes. Sur Android, utilisez <b>Chrome</b>.</p>;

    default:
      return <p>Impossible de vérifier les alertes. <Link to="/equipe/alertes" reloadDocument>Recharger la page</Link></p>;
  }
}
