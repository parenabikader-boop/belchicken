import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { staffApi } from '../../api/client.js';
import { ROLE_LABEL, useStaff } from '../StaffContext.jsx';
import { formatDateTime, formatPhone, timeAgo } from '../orders/labels.js';
import { PASSWORD_MIN } from '../account/PasswordForm.jsx';
import { plural } from '../../utils/format.js';

// Mot de passe provisoire facile à dicter au téléphone : 4 lettres, un tiret, 4 chiffres
// (sans l, o, i, 0 ni 1, qu'on confond à l'oral ou à l'écrit)
function provisionalPassword() {
  const letters = 'abcdefghjkmnpqrstuvwxyz';
  const digits = '23456789';
  const r = crypto.getRandomValues(new Uint32Array(8));
  const pick = (set, i) => set[r[i] % set.length];
  return [0, 1, 2, 3].map((i) => pick(letters, i)).join('') + '-' + [4, 5, 6, 7].map((i) => pick(digits, i)).join('');
}

// Champ du mot de passe provisoire : visible (le Patron doit le transmettre), avec un bouton « Proposer »
function ProvisionalField({ id, value, onChange }) {
  return (
    <div className="f">
      <label htmlFor={id}>Mot de passe provisoire</label>
      <div className="tm-gen">
        <input id={id} type="text" autoComplete="off" autoCapitalize="none" spellCheck="false" value={value} onChange={(e) => onChange(e.target.value)} />
        <button type="button" className="btn btn-s" onClick={() => onChange(provisionalPassword())}>Proposer</button>
      </div>
      <span className="hint">Au moins {PASSWORD_MIN} caractères. À remplacer par un mot de passe personnel à la première connexion.</span>
    </div>
  );
}

// Message à transmettre au membre après création, réinitialisation ou réactivation
function Handover({ info, onClose }) {
  return (
    <div className="st-box tm-handover" role="status">
      <b>{info.title}</b>
      <p>Donnez-lui ces informations (de vive voix ou par message) :</p>
      <dl className="st-dl">
        <dt>Adresse</dt><dd>{window.location.origin}/equipe</dd>
        <dt>Numéro</dt><dd>{formatPhone(info.phone)}</dd>
        <dt>Mot de passe provisoire</dt><dd className="tm-secret">{info.password}</dd>
      </dl>
      <p className="st-muted">À la première connexion, l’espace équipe demandera de choisir un mot de passe personnel. Ce message ne sera plus affiché ensuite.</p>
      <button type="button" className="btn btn-s" onClick={onClose}>C’est noté</button>
    </div>
  );
}

// Rôles créés depuis cette page (les comptes Patron : npm run equipe:patron)
const NEW_ROLES = [
  { role: 'OPERATEUR', help: 'Voit et fait avancer les commandes, rend un plat disponible ou non. Ni chiffres, ni prix, ni comptes.' },
  { role: 'LIVREUR', help: 'Voit seulement ses courses du jour (client, adresse, plats et frais de livraison à encaisser, sans autre montant) et valide la remise avec le code du client.' },
];

function NewMember({ onCreated, onCancel }) {
  const [form, setForm] = useState({ role: 'OPERATEUR', name: '', phone: '', password: provisionalPassword() });
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const set = (field) => (value) => setForm((f) => ({ ...f, [field]: value }));

  const submit = async (e) => {
    e.preventDefault();
    if (form.name.trim().length < 2) return setError('Indiquez le nom.');
    if (!form.phone.trim()) return setError('Indiquez le numéro de téléphone.');
    if (form.password.length < PASSWORD_MIN) return setError(`Le mot de passe provisoire doit avoir au moins ${PASSWORD_MIN} caractères.`);
    setError('');
    setSending(true);
    try {
      const member = await staffApi.createMember(form);
      onCreated(member, form.password);
    } catch (err) {
      setError(err.message);
      setSending(false);
    }
  };

  return (
    <form className="st-box tm-new" onSubmit={submit} noValidate>
      <h2>Nouveau compte</h2>
      <div className="cr-pick" role="radiogroup" aria-label="Rôle">
        {NEW_ROLES.map((r) => (
          <label key={r.role} className="cr-opt">
            <input type="radio" name="tm-role" value={r.role} checked={form.role === r.role} onChange={() => set('role')(r.role)} />
            <span><b>{ROLE_LABEL[r.role]}</b><small>{r.help}</small></span>
          </label>
        ))}
      </div>
      {error && <div className="alert err" role="alert"><span>{error}</span></div>}
      <div className="fields">
        <div className="f">
          <label htmlFor="tm-name">Nom</label>
          <input id="tm-name" type="text" autoComplete="off" value={form.name} onChange={(e) => set('name')(e.target.value)} autoFocus />
        </div>
        <div className="f">
          <label htmlFor="tm-phone">Numéro de téléphone</label>
          <input id="tm-phone" type="tel" inputMode="tel" autoComplete="off" placeholder="76 12 34 56" value={form.phone} onChange={(e) => set('phone')(e.target.value)} />
          <span className="hint">Il servira à se connecter.</span>
        </div>
      </div>
      <ProvisionalField id="tm-pass" value={form.password} onChange={set('password')} />
      <div className="mn-bar">
        <button type="submit" className="btn btn-p" disabled={sending}>{sending ? 'Création…' : 'Créer le compte'}</button>
        <button type="button" className="btn btn-s" onClick={onCancel}>Annuler</button>
      </div>
    </form>
  );
}

// « il y a 2 h » le jour même, sinon « 1 octobre à 22:40 »
const lastLogin = (iso) => {
  if (!iso) return 'jamais';
  return Date.now() - new Date(iso).getTime() < 24 * 60 * 60 * 1000 ? timeAgo(iso) : formatDateTime(iso);
};

function Member({ m, me, onChange }) {
  // null, 'reset', 'reactivate' ou 'deactivate' : l'action ouverte sous la fiche
  const [open, setOpen] = useState(null);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const isMe = m.id === me.id;
  const manageable = !isMe && m.role !== 'PATRON';

  const start = (action) => {
    setOpen(action);
    setError('');
    setPassword(action === 'deactivate' ? '' : provisionalPassword());
  };

  const run = async (e) => {
    e.preventDefault();
    if (open !== 'deactivate' && password.length < PASSWORD_MIN) return setError(`Au moins ${PASSWORD_MIN} caractères.`);
    setError('');
    setSending(true);
    try {
      if (open === 'deactivate') onChange(await staffApi.deactivateMember(m.id));
      else if (open === 'reset') onChange(await staffApi.resetMemberPassword(m.id, password), { title: `Mot de passe de ${m.name} réinitialisé`, password });
      else onChange(await staffApi.reactivateMember(m.id, password), { title: `Compte de ${m.name} réactivé`, password });
      setOpen(null);
    } catch (err) {
      setError(err.message);
    }
    setSending(false);
  };

  return (
    <li className={`st-box tm-member${m.isActive ? '' : ' off'}`}>
      <div className="tm-top">
        <b className="tm-name">{m.name}</b>
        <span className={`tm-role r-${m.role}`}>{ROLE_LABEL[m.role]}</span>
        {isMe && <span className="tm-me">C’est vous</span>}
        {!m.isActive && <span className="tm-off">Désactivé</span>}
      </div>
      <p className="tm-line"><a href={`tel:${m.phone}`}>{formatPhone(m.phone)}</a></p>
      <p className="tm-line st-muted">
        Dernière connexion : {lastLogin(m.lastLoginAt)}
        {m.isActive && m.devices > 0 && <> · connecté sur {plural(m.devices, 'appareil')}</>}
      </p>
      {m.isActive && m.mustChangePassword && <p className="tm-warn">Mot de passe provisoire pas encore remplacé</p>}

      {isMe && <p className="tm-actions"><Link className="mn-link" to="/equipe/mot-de-passe">Changer mon mot de passe</Link></p>}
      {manageable && !open && (
        <p className="tm-actions">
          {m.isActive ? (
            <>
              <button type="button" className="st-text-btn" onClick={() => start('reset')}>Mot de passe oublié</button>
              <button type="button" className="st-text-btn danger" onClick={() => start('deactivate')}>Désactiver</button>
            </>
          ) : (
            <button type="button" className="st-text-btn" onClick={() => start('reactivate')}>Réactiver</button>
          )}
        </p>
      )}

      {open && (
        <form className={`st-action tm-open${open === 'deactivate' ? ' cancel' : ''}`} onSubmit={run} noValidate>
          {open === 'deactivate' ? (
            <>
              <b>Désactiver le compte de {m.name} ?</b>
              <p>Plus aucune connexion possible avec ce compte. Tous ses téléphones sont déconnectés tout de suite et ne reçoivent plus les alertes de commande. Son nom reste dans l’historique des commandes.</p>
            </>
          ) : (
            <>
              <b>{open === 'reset' ? `Nouveau mot de passe provisoire pour ${m.name}` : `Réactiver le compte de ${m.name}`}</b>
              <p>{open === 'reset' ? 'Ses téléphones encore connectés sont déconnectés.' : 'L’ancien mot de passe ne marche plus : donnez-lui ce mot de passe provisoire.'}</p>
              <ProvisionalField id={`tm-pw-${m.id}`} value={password} onChange={setPassword} />
            </>
          )}
          {error && <p className="st-err" role="alert">{error}</p>}
          <div className="st-action-row">
            <button type="submit" className={`btn ${open === 'deactivate' ? 'st-btn-danger' : 'btn-p'}`} disabled={sending}>
              {sending ? 'Un instant…' : open === 'deactivate' ? 'Désactiver' : open === 'reset' ? 'Enregistrer le mot de passe' : 'Réactiver'}
            </button>
            <button type="button" className="st-text-btn" onClick={() => setOpen(null)}>Annuler</button>
          </div>
        </form>
      )}
    </li>
  );
}

// /equipe/equipe (Patron) : comptes de l'équipe. L'API refuse aussi ces actions à l'Opérateur.
export default function TeamPage() {
  const { user } = useStaff();
  const [members, setMembers] = useState(null);
  const [error, setError] = useState(null);
  const [adding, setAdding] = useState(false);
  const [handover, setHandover] = useState(null);

  const load = () => {
    setError(null);
    staffApi.team().then(setMembers, setError);
  };
  useEffect(load, []);

  const show = (info) => {
    setHandover(info);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  if (error && !members) {
    return (
      <>
        <div className="alert err" role="alert"><span>{error.message}</span></div>
        <button type="button" className="btn btn-p" style={{ marginTop: 14 }} onClick={load}>Réessayer</button>
      </>
    );
  }
  if (!members) return <p className="st-muted">Chargement de l'équipe…</p>;

  const active = members.filter((m) => m.isActive);
  const inactive = members.filter((m) => !m.isActive);
  const update = (member, info) => {
    setMembers((list) => list.map((x) => (x.id === member.id ? member : x)));
    if (info) show({ ...info, phone: member.phone });
  };

  return (
    <div className="tm">
      <div className="st-head">
        <h1 className="st-title">Équipe</h1>
        {!adding && <button type="button" className="btn btn-p mn-btn" onClick={() => { setAdding(true); setHandover(null); }}>+ Nouveau compte</button>}
      </div>
      <p className="st-muted tm-intro">Les comptes de l’espace équipe. Chacun se connecte avec son numéro et son propre mot de passe.</p>

      {handover && <Handover info={handover} onClose={() => setHandover(null)} />}
      {adding && (
        <NewMember
          onCancel={() => setAdding(false)}
          onCreated={(member, password) => {
            setMembers((list) => [...list, member]);
            setAdding(false);
            show({ title: `Compte de ${member.name} créé`, phone: member.phone, password });
          }}
        />
      )}

      <h2 className="mn-section">Actifs <span>{plural(active.length, 'compte')}</span></h2>
      <ul className="tm-list">
        {active.map((m) => <Member key={m.id} m={m} me={user} onChange={update} />)}
      </ul>

      {inactive.length > 0 && (
        <>
          <h2 className="mn-section">Désactivés <span>{plural(inactive.length, 'compte')}</span></h2>
          <ul className="tm-list">
            {inactive.map((m) => <Member key={m.id} m={m} me={user} onChange={update} />)}
          </ul>
        </>
      )}
    </div>
  );
}
