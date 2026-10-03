import { useState } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { StaffScreen } from '../StaffScreen.jsx';
import { useStaff } from '../StaffContext.jsx';
import InstallBanner from '../../components/InstallBanner.jsx';

// Page demandée avant la connexion, seulement si elle est dans l'espace équipe
const safeNext = (value) => (value && /^\/equipe(\/|$)/.test(value) ? value : '/equipe');

export default function Login() {
  const { status, login } = useStaff();
  const [params] = useSearchParams();
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);

  if (status === 'ready') return <Navigate to={safeNext(params.get('suite'))} replace />;

  const submit = async (e) => {
    e.preventDefault();
    if (!phone.trim() || !password) {
      setError('Indiquez votre numéro et votre mot de passe.');
      return;
    }
    setError('');
    setSending(true);
    try {
      await login(phone, password);
    } catch (err) {
      setError(err.message);
      setPassword('');
      setSending(false);
    }
  };

  return (
    <StaffScreen>
      <h1 className="st-title">Connexion</h1>
      <p className="st-muted">Réservé à l'équipe Belchicken.</p>
      <form className="st-form" onSubmit={submit} noValidate>
        {error && <div className="alert err" role="alert"><span>{error}</span></div>}
        <div className="f">
          <label htmlFor="st-phone">Numéro de téléphone</label>
          <input id="st-phone" type="tel" inputMode="tel" autoComplete="username" placeholder="76 12 34 56" value={phone} onChange={(e) => setPhone(e.target.value)} autoFocus />
        </div>
        <div className="f">
          <label htmlFor="st-pass">Mot de passe</label>
          <input id="st-pass" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        <button type="submit" className="btn btn-p btn-block" disabled={sending}>{sending ? 'Connexion…' : 'Se connecter'}</button>
      </form>
      <InstallBanner app="equipe" />
    </StaffScreen>
  );
}
