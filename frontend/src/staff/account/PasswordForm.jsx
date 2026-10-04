import { useState } from 'react';
import { staffApi } from '../../api/client.js';
import { useStaff } from '../StaffContext.jsx';

export const PASSWORD_MIN = 8; // même règle que l'API

// Changer son propre mot de passe. forced : mot de passe provisoire (première connexion ou
// réinitialisation par le Patron), l'ancien n'est pas redemandé.
export default function PasswordForm({ forced = false, onDone }) {
  const { setUser } = useStaff();
  const [form, setForm] = useState({ current: '', next: '', again: '' });
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);

  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    if (!forced && !form.current) return setError('Indiquez votre mot de passe actuel.');
    if (form.next.length < PASSWORD_MIN) return setError(`Le nouveau mot de passe doit avoir au moins ${PASSWORD_MIN} caractères.`);
    if (form.next !== form.again) return setError('Les deux nouveaux mots de passe sont différents.');
    setError('');
    setSending(true);
    try {
      const user = await staffApi.changePassword({ currentPassword: forced ? undefined : form.current, newPassword: form.next });
      setForm({ current: '', next: '', again: '' });
      setSending(false);
      onDone?.();
      setUser(user);
    } catch (err) {
      setError(err.message);
      setSending(false);
    }
  };

  const type = show ? 'text' : 'password';
  return (
    <form className="st-form" onSubmit={submit} noValidate>
      {error && <div className="alert err" role="alert"><span>{error}</span></div>}
      {!forced && (
        <div className="f">
          <label htmlFor="pw-current">Mot de passe actuel</label>
          <input id="pw-current" type={type} autoComplete="current-password" value={form.current} onChange={set('current')} />
        </div>
      )}
      <div className="f">
        <label htmlFor="pw-next">Nouveau mot de passe</label>
        <input id="pw-next" type={type} autoComplete="new-password" value={form.next} onChange={set('next')} autoFocus={forced} />
        <span className="hint">Au moins {PASSWORD_MIN} caractères. Ne le donnez à personne.</span>
      </div>
      <div className="f">
        <label htmlFor="pw-again">Retapez le nouveau mot de passe</label>
        <input id="pw-again" type={type} autoComplete="new-password" value={form.again} onChange={set('again')} />
      </div>
      <label className="mn-check">
        <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} /> Afficher les mots de passe
      </label>
      <button type="submit" className="btn btn-p btn-block" disabled={sending}>
        {sending ? 'Enregistrement…' : forced ? 'Enregistrer et continuer' : 'Changer mon mot de passe'}
      </button>
    </form>
  );
}
