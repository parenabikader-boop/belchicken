import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { staffApi } from '../../api/client.js';

const newGroup = () => ({ key: Math.random().toString(36).slice(2), name: '', note: '' });

// Fiche d'une catégorie (Patron) : nom, petit titre, description, sections, visibilité
export default function CategoryForm() {
  const { id } = useParams();
  const isNew = !id;
  const navigate = useNavigate();
  const [form, setForm] = useState(null);
  const [count, setCount] = useState(0);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (isNew) {
      setForm({ name: '', script: '', description: '', isActive: true, groups: [] });
      return;
    }
    staffApi.menu().then((m) => {
      const c = m.categories.find((x) => x.id === id);
      if (!c) return setError(new Error('Catégorie introuvable.'));
      setCount(c.products.length);
      setForm({
        ...c,
        script: c.script ?? '',
        description: c.description ?? '',
        groups: c.groups.map((g) => ({ ...g, key: g.id, note: g.note ?? '', count: c.products.filter((p) => p.groupId === g.id).length })),
      });
    }, setError);
  }, [id, isNew]);

  if (!form) {
    return (
      <>
        <Link className="st-back" to="/equipe/menu">‹ Menu</Link>
        {error ? <div className="alert err" role="alert"><span>{error.message}</span></div> : <p className="st-muted">Chargement…</p>}
      </>
    );
  }

  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  const setGroup = (key, field, value) => setForm((f) => ({ ...f, groups: f.groups.map((g) => (g.key === key ? { ...g, [field]: value } : g)) }));
  const moveGroup = (i, dir) =>
    setForm((f) => {
      const groups = [...f.groups];
      [groups[i], groups[i + dir]] = [groups[i + dir], groups[i]];
      return { ...f, groups };
    });
  const backTo = `/equipe/menu${form.slug ? `?categorie=${form.slug}` : ''}`;

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const body = {
      name: form.name,
      script: form.script,
      description: form.description,
      isActive: form.isActive,
      groups: form.groups.map((g) => ({ ...(g.id ? { id: g.id } : {}), name: g.name, note: g.note })),
    };
    try {
      if (isNew) await staffApi.createCategory(body);
      else await staffApi.updateCategory(id, body);
      navigate(isNew ? '/equipe/menu' : backTo, { replace: true });
    } catch (err) {
      setError(err);
      setSaving(false);
      window.scrollTo(0, 0);
    }
  };

  const remove = async () => {
    setSaving(true);
    try {
      await staffApi.deleteCategory(id);
      navigate('/equipe/menu', { replace: true });
    } catch (err) {
      setError(err);
      setSaving(false);
      setConfirmDelete(false);
      window.scrollTo(0, 0);
    }
  };

  return (
    <form className="mn-form" onSubmit={submit} noValidate>
      <Link className="st-back" to={backTo}>‹ Menu</Link>
      <h1 className="st-title">{isNew ? 'Nouvelle catégorie' : form.name || 'Catégorie sans nom'}</h1>

      {error && <div className="alert err" role="alert" style={{ margin: '12px 0' }}><span>{error.message}</span></div>}

      <section className="st-box mn-box">
        <h2>La catégorie</h2>
        <div className="fields">
          <div className="f">
            <label htmlFor="cf-name">Nom <i>*</i></label>
            <input id="cf-name" value={form.name} onChange={set('name')} maxLength={60} placeholder="Ex. Burgers" />
          </div>
          <div className="f">
            <label htmlFor="cf-script">Petit titre</label>
            <input id="cf-script" value={form.script} onChange={set('script')} maxLength={40} placeholder="Ex. Originals & XL" />
            <span className="hint">Écrit à la main au-dessus du nom, dans le bandeau.</span>
          </div>
          <div className="f full">
            <label htmlFor="cf-desc">Description</label>
            <textarea id="cf-desc" value={form.description} onChange={set('description')} maxLength={300} placeholder="Ex. Chaque burger existe en menu, avec frites et boisson, ou seul." />
          </div>
          <label className="mn-check full">
            <input type="checkbox" checked={form.isActive} onChange={set('isActive')} />
            Visible sur le site
            <small>Décochez pour masquer toute la catégorie sans rien supprimer.</small>
          </label>
        </div>
      </section>

      {!isNew && (
        <section className="st-box mn-box mn-photo">
          <h2>Photo vedette du bandeau</h2>
          <div className="mn-th big">{form.heroImageUrl ? <img src={form.heroImageUrl} alt="" /> : <span>Aucune photo</span>}</div>
          <p className="st-muted">Le changement de photo arrive à l'étape suivante.</p>
        </section>
      )}

      <section className="st-box mn-box">
        <h2>Sections</h2>
        <p className="st-muted mn-help">Sous-titres qui regroupent les plats (ex. « Originals », « XL Burgers »). Facultatif.</p>
        {form.groups.length === 0 && <p className="st-muted mn-none">Aucune section : les plats s'affichent à la suite.</p>}
        <div className="mn-variants">
          {form.groups.map((g, i) => (
            <div key={g.key} className="mn-variant mn-groupline">
              <div className="f">
                <label htmlFor={`cg-n-${g.key}`}>Section</label>
                <input id={`cg-n-${g.key}`} value={g.name} onChange={(e) => setGroup(g.key, 'name', e.target.value)} maxLength={60} />
              </div>
              <div className="f">
                <label htmlFor={`cg-note-${g.key}`}>Précision</label>
                <input id={`cg-note-${g.key}`} value={g.note} onChange={(e) => setGroup(g.key, 'note', e.target.value)} maxLength={60} placeholder="Ex. N° 7 à 9" />
              </div>
              <span className="mn-arrows">
                <button type="button" disabled={i === 0} onClick={() => moveGroup(i, -1)} aria-label={`Monter ${g.name}`}>↑</button>
                <button type="button" disabled={i === form.groups.length - 1} onClick={() => moveGroup(i, 1)} aria-label={`Descendre ${g.name}`}>↓</button>
              </span>
              <button type="button" className="mn-remove"
                onClick={() => setForm((f) => ({ ...f, groups: f.groups.filter((x) => x.key !== g.key) }))}
                aria-label={`Retirer la section ${g.name}`} title={g.count ? `Ses ${g.count} plats passeront dans « Autres »` : 'Retirer cette section'}>×</button>
            </div>
          ))}
        </div>
        <button type="button" className="st-text-btn" onClick={() => setForm((f) => ({ ...f, groups: [...f.groups, newGroup()] }))}>+ Ajouter une section</button>
      </section>

      <div className="mn-bar">
        <button type="submit" className="btn btn-p" disabled={saving}>{saving ? 'Enregistrement…' : isNew ? 'Créer la catégorie' : 'Enregistrer'}</button>
        <Link className="btn btn-s" to={backTo}>Annuler</Link>
      </div>

      {!isNew && (
        <div className="mn-danger">
          {!confirmDelete ? (
            <button type="button" className="st-text-btn danger" onClick={() => setConfirmDelete(true)}>Supprimer cette catégorie</button>
          ) : (
            <div className="st-action cancel">
              <b>Supprimer « {form.name} » ?</b>
              <p>{count > 0 ? `Elle contient ${count} plat${count > 1 ? 's' : ''} : l'API refusera. Pour la retirer du site, décochez plutôt « Visible sur le site ».` : 'Elle est vide : elle sera supprimée.'}</p>
              <div className="st-action-row">
                <button type="button" className="btn st-btn-danger" disabled={saving} onClick={remove}>Oui, supprimer</button>
                <button type="button" className="st-text-btn" onClick={() => setConfirmDelete(false)}>Non, garder</button>
              </div>
            </div>
          )}
        </div>
      )}
    </form>
  );
}
