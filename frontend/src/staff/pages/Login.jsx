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
  // Lot 4, compte Prestataire : mot de passe juste, code à 6 chiffres demandé ensuite
  const [codeStep, setCodeStep] = useState(false);

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
      const result = await login(phone, password);
      setPassword('');
      if (result.codeRequired) {
        setCodeStep(true);
        setSending(false);
      }
    } catch (err) {
      setError(err.message);
      setPassword('');
      setSending(false);
    }
  };

  if (codeStep) {
    return (
      <StaffScreen>
        <CodeForm onRestart={(message) => { setCodeStep(false); setError(message || ''); }} />
      </StaffScreen>
    );
  }

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

// Second temps de la connexion du Prestataire : code de Google Authenticator, ou code de secours
function CodeForm({ onRestart }) {
  const { loginCode } = useStaff();
  const [code, setCode] = useState('');
  const [recovery, setRecovery] = useState(false);
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!code.trim()) return setError(recovery ? 'Tapez un de vos codes de secours.' : 'Tapez le code à 6 chiffres.');
    setError('');
    setSending(true);
    try {
      await loginCode(code.trim());
    } catch (err) {
      // Délai dépassé ou compte bloqué : retour au mot de passe
      if (err.code === 'CODE_EXPIRE' || err.code === 'TROP_DE_TENTATIVES') return onRestart(err.message);
      setError(err.message);
      setCode('');
      setSending(false);
    }
  };

  return (
    <>
      <h1 className="st-title">Code de vérification</h1>
      <p className="st-muted">
        {recovery
          ? 'Tapez un de vos codes de secours (chacun ne sert qu’une fois).'
          : 'Ouvrez Google Authenticator sur votre téléphone et tapez le code à 6 chiffres de « Belchicken Équipe ».'}
      </p>
      <form className="st-form" onSubmit={submit} noValidate>
        {error && <div className="alert err" role="alert"><span>{error}</span></div>}
        <div className="f">
          <label htmlFor="st-code">{recovery ? 'Code de secours' : 'Code à 6 chiffres'}</label>
          {recovery ? (
            <input key="rec" id="st-code" type="text" autoComplete="off" autoCapitalize="characters" spellCheck="false" placeholder="ABCDE-FGHJK" maxLength={20} value={code} onChange={(e) => setCode(e.target.value)} autoFocus />
          ) : (
            <input key="otp" id="st-code" className="st-otp" type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]*" placeholder="123456" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} autoFocus />
          )}
          <span className="hint">Valable 5 minutes après le mot de passe. Après 5 essais ratés, le compte est bloqué un moment.</span>
        </div>
        <button type="submit" className="btn btn-p btn-block" disabled={sending}>{sending ? 'Vérification…' : 'Valider'}</button>
      </form>
      <p style={{ textAlign: 'center', margin: '14px 0 0', display: 'flex', justifyContent: 'center', gap: 16, flexWrap: 'wrap' }}>
        <button type="button" className="st-text-btn" onClick={() => { setRecovery(!recovery); setCode(''); setError(''); }}>
          {recovery ? 'Utiliser le code de l’application' : 'Utiliser un code de secours'}
        </button>
        <button type="button" className="st-text-btn" onClick={() => onRestart('')}>Recommencer</button>
      </p>
    </>
  );
}
