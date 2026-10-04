import { useState } from 'react';
import { ROLE_LABEL, useStaff } from '../StaffContext.jsx';
import { formatPhone } from '../orders/labels.js';
import PasswordForm from './PasswordForm.jsx';

// /equipe/mot-de-passe : chaque membre (Patron ou Opérateur) change son propre mot de passe
export default function PasswordPage() {
  const { user } = useStaff();
  const [done, setDone] = useState(false);

  return (
    <>
      <div className="st-head">
        <h1 className="st-title">Mon mot de passe</h1>
      </div>
      <p className="st-muted" style={{ marginBottom: 18 }}>
        {user.name} · {ROLE_LABEL[user.role]} · {formatPhone(user.phone)}
      </p>
      <div className="st-box tm-pw">
        {done && (
          <div className="alert ok" role="status">
            <span>Mot de passe changé. Vos autres téléphones ont été déconnectés : reconnectez-les avec le nouveau mot de passe.</span>
          </div>
        )}
        <PasswordForm onDone={() => setDone(true)} />
      </div>
    </>
  );
}

// Écran affiché à la place de tout l'espace équipe tant que le mot de passe est provisoire
export function ForcedPassword() {
  const { user, logout } = useStaff();
  return (
    <>
      <h1 className="st-title">Choisissez votre mot de passe</h1>
      <p className="st-muted">
        Bonjour {user.name}. Le mot de passe que vous avez reçu est provisoire : choisissez le vôtre pour continuer.
        Personne d’autre ne le connaîtra.
      </p>
      <PasswordForm forced />
      <p style={{ textAlign: 'center', margin: '14px 0 0' }}>
        <button type="button" className="st-text-btn" onClick={logout}>Se déconnecter</button>
      </p>
    </>
  );
}
