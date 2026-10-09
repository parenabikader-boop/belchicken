import { useEffect, useState } from 'react';
import { staffApi } from '../../api/client.js';

// Provenances des commandes (lot 2), réglées par le Patron : ajout, nom, type, numéro WhatsApp, ordre,
// activation, suppression (seulement si jamais utilisée). « Site » est fixe : jamais proposée à l'agent.
const KINDS = [
  { id: 'APPEL', label: 'Appel' },
  { id: 'WHATSAPP', label: 'WhatsApp' },
  { id: 'AUTRE', label: 'Autre' },
];
const KIND_LABEL = { SITE: 'Site du restaurant', ...Object.fromEntries(KINDS.map((k) => [k.id, k.label])) };
const NEW = { name: '', kind: 'APPEL', phone: '' };
const formatPhone = (p) => p?.replace(/^\+226(\d{2})(\d{2})(\d{2})(\d{2})$/, '+226 $1 $2 $3 $4') || '';

export default function SourcesBox() {
  const [sources, setSources] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(null); // 'new' | id
  const [form, setForm] = useState(NEW);

  useEffect(() => {
    staffApi.sources().then(setSources, setError);
  }, []);

  const run = async (call) => {
    setBusy(true);
    setError(null);
    try {
      setSources(await call());
      setBusy(false);
      return true;
    } catch (e) {
      setError(e);
      setBusy(false);
      if (e.code === 'LISTE_CHANGEE') staffApi.sources().then(setSources, () => {});
      return false;
    }
  };

  const save = async (e) => {
    e.preventDefault();
    const body = { name: form.name, kind: form.kind, ...(form.kind === 'WHATSAPP' && { phone: form.phone }) };
    const ok = await run(() => (editing === 'new' ? staffApi.createSource(body) : staffApi.updateSource(editing, body)));
    if (ok) setEditing(null);
  };

  const move = (index, delta) => {
    const ids = sources.map((s) => s.id);
    [ids[index], ids[index + delta]] = [ids[index + delta], ids[index]];
    run(() => staffApi.reorderSources(ids));
  };

  const startEdit = (s) => {
    setForm(s ? { name: s.name, kind: s.kind, phone: formatPhone(s.phone) } : NEW);
    setEditing(s ? s.id : 'new');
    setError(null);
  };

  const editor = (
    <form className="rg-src-form" onSubmit={save}>
      <div className="f">
        <label htmlFor="src-name">Nom affiché</label>
        <input id="src-name" type="text" maxLength={60} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ex. : WhatsApp +226 50 62 70 70 (Telmob)" autoFocus />
      </div>
      <div className="no-opts" role="radiogroup" aria-label="Type">
        {KINDS.map((k) => (
          <button key={k.id} type="button" role="radio" aria-checked={form.kind === k.id} className={`no-opt${form.kind === k.id ? ' on' : ''}`} onClick={() => setForm({ ...form, kind: k.id })}>{k.label}</button>
        ))}
      </div>
      {form.kind === 'WHATSAPP' && (
        <div className="f">
          <label htmlFor="src-phone">Numéro WhatsApp depuis lequel l’agent écrit au client</label>
          <input id="src-phone" type="tel" inputMode="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="Ex. : 50 62 70 70" />
        </div>
      )}
      <div className="st-action-row">
        <button type="submit" className="btn btn-p" disabled={busy || form.name.trim().length < 2 || (form.kind === 'WHATSAPP' && !form.phone.trim())}>{busy ? 'Enregistrement…' : 'Enregistrer'}</button>
        <button type="button" className="st-text-btn" onClick={() => setEditing(null)}>Annuler</button>
      </div>
    </form>
  );

  return (
    <section className="st-box rg-opt rg-src">
      <h2 className="rg-src-t">Provenances des commandes</h2>
      <p className="st-muted">
        Proposées à l’agent dans cet ordre quand il saisit une commande. « Site » est réservée aux commandes passées par le client sur le site :
        elle n’est jamais proposée à l’agent. Une provenance déjà utilisée ne se supprime pas : désactivez-la.
      </p>
      {error && <div className="alert err" role="alert"><span>{error.message}</span></div>}
      {!sources && !error && <p className="st-muted">Chargement…</p>}
      {sources && (
        <ul className="rg-src-list">
          {sources.map((s, i) => (
            <li key={s.id} className={s.isActive ? undefined : 'off'}>
              {editing === s.id ? editor : (
                <>
                  <span className="rg-src-n">
                    <b>{s.name}</b>
                    <small>
                      {KIND_LABEL[s.kind]}{s.phone && ` · ${formatPhone(s.phone)}`} · {s.ordersCount} commande{s.ordersCount > 1 ? 's' : ''}
                      {!s.isActive && ' · désactivée'}
                    </small>
                  </span>
                  {s.kind === 'SITE' ? (
                    <span className="st-muted rg-src-fixed">Fixe</span>
                  ) : (
                    <span className="rg-src-act">
                      <button type="button" className="st-text-btn" disabled={busy || i <= 1} onClick={() => move(i, -1)} aria-label={`Monter ${s.name}`}>↑</button>
                      <button type="button" className="st-text-btn" disabled={busy || i === sources.length - 1} onClick={() => move(i, 1)} aria-label={`Descendre ${s.name}`}>↓</button>
                      <button type="button" className="st-text-btn" disabled={busy} onClick={() => startEdit(s)}>Modifier</button>
                      <button type="button" className="st-text-btn" disabled={busy} onClick={() => run(() => staffApi.setSourceActive(s.id, !s.isActive))}>{s.isActive ? 'Désactiver' : 'Activer'}</button>
                      {s.ordersCount === 0 && (
                        <button type="button" className="st-text-btn danger" disabled={busy} onClick={() => window.confirm(`Supprimer « ${s.name} » ?`) && run(() => staffApi.deleteSource(s.id))}>Supprimer</button>
                      )}
                    </span>
                  )}
                </>
              )}
            </li>
          ))}
        </ul>
      )}
      {editing === 'new' ? editor : sources && <button type="button" className="btn btn-s" onClick={() => startEdit(null)}>+ Ajouter une provenance</button>}
    </section>
  );
}
