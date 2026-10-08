import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { staffApi } from '../../api/client.js';
import { formatPrice } from '../../utils/format.js';
import PhotoPicker from './PhotoPicker.jsx';

const lines = (text) => text.split('\n').map((s) => s.trim()).filter(Boolean);
// "5 500" -> 5500 ; autre chose est envoyé tel quel pour que l'API explique l'erreur
const toPrice = (v) => {
  const n = String(v).replace(/[\s  ]/g, '').replace(/F$/i, '');
  if (n === '') return undefined;
  return /^\d+$/.test(n) ? Number(n) : n;
};
const emptyVariant = () => ({ key: Math.random().toString(36).slice(2), label: '', subLabel: '', price: '', drinkCount: 0 });
const DRINK_COUNTS = [0, 1, 2, 3, 4, 5, 6, 8, 10];

// Fiche d'un plat (Patron) : création (/equipe/menu/plats/nouveau) ou modification (/equipe/menu/plats/:id)
export default function ProductForm() {
  const { id } = useParams();
  const isNew = !id;
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [menu, setMenu] = useState(null);
  const [form, setForm] = useState(null);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    staffApi.menu().then(
      (m) => {
        setMenu(m);
        const product = m.categories.flatMap((c) => c.products).find((p) => p.id === id);
        if (!isNew && !product) {
          setError(new Error('Plat introuvable : il a peut-être été retiré du menu.'));
          return;
        }
        const categoryId = product?.categoryId || params.get('categorie') || m.categories[0]?.id || '';
        setForm(
          product
            ? {
                ...product,
                number: product.number ?? '',
                description: product.description ?? '',
                serves: product.serves ?? '',
                choiceLabel: product.choiceLabel ?? '',
                composition: product.composition.join('\n'),
                choices: product.choices.join('\n'),
                groupId: product.groupId ?? '',
                variants: product.variants.map((v) => ({ ...v, key: v.id, subLabel: v.subLabel ?? '', price: String(v.price), drinkCount: v.drinkCount ?? 0 })),
              }
            : {
                name: '', number: '', description: '', composition: '', isSpicy: false, serves: '', choiceLabel: '', choices: '',
                categoryId, groupId: m.categories.find((c) => c.id === categoryId)?.groups[0]?.id ?? '',
                variants: [emptyVariant()],
              },
        );
      },
      setError,
    );
  }, [id, isNew, params]);

  if (!form) {
    return (
      <>
        <Link className="st-back" to="/equipe/menu">‹ Menu</Link>
        {error ? <div className="alert err" role="alert"><span>{error.message}</span></div> : <p className="st-muted">Chargement…</p>}
      </>
    );
  }

  const category = menu.categories.find((c) => c.id === form.categoryId);
  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  const setVariant = (key, field, value) =>
    setForm((f) => ({ ...f, variants: f.variants.map((v) => (v.key === key ? { ...v, [field]: value } : v)) }));
  const backTo = `/equipe/menu${category ? `?categorie=${category.slug}` : ''}`;

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const body = {
      name: form.name,
      number: form.number === '' ? null : Number(form.number),
      description: form.description,
      composition: lines(form.composition),
      isSpicy: form.isSpicy,
      serves: form.serves,
      choiceLabel: form.choiceLabel,
      choices: lines(form.choices),
      categoryId: form.categoryId,
      groupId: form.groupId || null,
      // Une boisson ne comprend pas de boisson
      variants: form.variants.map((v) => ({
        ...(v.id ? { id: v.id } : {}), label: v.label, subLabel: v.subLabel, price: toPrice(v.price), drinkCount: category?.isDrinks ? 0 : Number(v.drinkCount) || 0,
      })),
    };
    try {
      if (isNew) {
        // Le plat existe : on reste sur sa fiche pour ajouter sa photo
        const created = await staffApi.createProduct(body);
        navigate(`/equipe/menu/plats/${created.id}?nouveau=1`, { replace: true });
      } else {
        await staffApi.updateProduct(id, body);
        navigate(backTo, { replace: true });
      }
    } catch (err) {
      setError(err);
      setSaving(false);
      window.scrollTo(0, 0);
    }
  };

  const remove = async () => {
    setSaving(true);
    try {
      await staffApi.deleteProduct(id);
      navigate(backTo, { replace: true });
    } catch (err) {
      setError(err);
      setSaving(false);
    }
  };

  return (
    <form className="mn-form" onSubmit={submit} noValidate>
      <Link className="st-back" to={backTo}>‹ Menu</Link>
      <h1 className="st-title">{isNew ? 'Nouveau plat' : form.name || 'Plat sans nom'}</h1>
      {!isNew && !form.isAvailable && <p className="mn-warn">Ce plat est actuellement indisponible sur le site.</p>}

      {error && <div className="alert err" role="alert" style={{ margin: '12px 0' }}><span>{error.message}</span></div>}
      {!isNew && params.get('nouveau') && !error && (
        <div className="alert ok" role="status" style={{ margin: '12px 0' }}><span>Plat ajouté au menu. Ajoutez maintenant sa photo.</span></div>
      )}

      {isNew ? (
        <p className="st-muted mn-photo-later">Photo : vous pourrez l'ajouter juste après avoir enregistré le plat.</p>
      ) : (
        <PhotoPicker
          title="Photo du plat"
          currentUrl={form.imageUrl}
          emptyLabel="Photo à venir"
          onSave={async (blob) => {
            const p = await staffApi.setProductPhoto(id, blob);
            setForm((f) => ({ ...f, imageUrl: p.imageUrl }));
          }}
          onRemove={async () => {
            await staffApi.removeProductPhoto(id);
            setForm((f) => ({ ...f, imageUrl: null }));
          }}
        />
      )}

      <section className="st-box mn-box">
        <h2>Le plat</h2>
        <div className="fields">
          <div className="f">
            <label htmlFor="pf-cat">Catégorie</label>
            <select id="pf-cat" value={form.categoryId} onChange={(e) => {
              const c = menu.categories.find((x) => x.id === e.target.value);
              setForm((f) => ({ ...f, categoryId: e.target.value, groupId: c?.groups[0]?.id ?? '' }));
            }}>
              {menu.categories.map((c) => <option key={c.id} value={c.id}>{c.name}{c.isActive ? '' : ' (masquée)'}</option>)}
            </select>
          </div>
          <div className="f">
            <label htmlFor="pf-group">Section</label>
            <select id="pf-group" value={form.groupId} onChange={set('groupId')}>
              {category?.groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
              <option value="">Aucune (« Autres »)</option>
            </select>
          </div>
          <div className="f mn-f-num">
            <label htmlFor="pf-num">N° du menu</label>
            <input id="pf-num" type="number" inputMode="numeric" min="1" max="999" value={form.number} onChange={set('number')} placeholder="Facultatif" />
          </div>
          <div className="f">
            <label htmlFor="pf-name">Nom <i>*</i></label>
            <input id="pf-name" value={form.name} onChange={set('name')} maxLength={80} required />
          </div>
          <div className="f full">
            <label htmlFor="pf-desc">Description</label>
            <textarea id="pf-desc" value={form.description} onChange={set('description')} maxLength={300} placeholder="Ex. Poulet croustillant, salade, sauce crémeuse." />
          </div>
        </div>
      </section>

      <section className="st-box mn-box">
        <h2>Formules et prix <i className="mn-req">*</i></h2>
        <p className="st-muted mn-help">Une seule ligne pour un prix unique. Plusieurs lignes pour « Menu / Seul », « Taille L / XL », « 4 / 8 pièces »…</p>
        {!category?.isDrinks && <p className="st-muted mn-help">Boissons comprises : le client les choisit parmi les boissons disponibles, sans supplément (Menu : 1, Family Bucket : 4, Seul : aucune).</p>}
        <div className="mn-variants">
          {form.variants.map((v, i) => (
            <div key={v.key} className={category?.isDrinks ? "mn-variant no-drinks" : "mn-variant"}>
              <div className="f">
                <label htmlFor={`pv-l-${v.key}`}>Formule</label>
                <input id={`pv-l-${v.key}`} value={v.label} onChange={(e) => setVariant(v.key, 'label', e.target.value)} placeholder={i === 0 ? 'Ex. Menu, Standard' : 'Ex. Seul'} maxLength={40} />
              </div>
              <div className="f">
                <label htmlFor={`pv-s-${v.key}`}>Précision</label>
                <input id={`pv-s-${v.key}`} value={v.subLabel} onChange={(e) => setVariant(v.key, 'subLabel', e.target.value)} placeholder="Ex. Avec frites et boisson" maxLength={60} />
              </div>
              <div className="f mn-price">
                <label htmlFor={`pv-p-${v.key}`}>Prix (F)</label>
                <input id={`pv-p-${v.key}`} inputMode="numeric" value={v.price} onChange={(e) => setVariant(v.key, 'price', e.target.value)} placeholder="5500" />
                {typeof toPrice(v.price) === 'number' && <small>{formatPrice(toPrice(v.price))}</small>}
              </div>
              {!category?.isDrinks && (
                <div className="f mn-drinks">
                  <label htmlFor={`pv-d-${v.key}`}>Boissons comprises</label>
                  <select id={`pv-d-${v.key}`} value={v.drinkCount} onChange={(e) => setVariant(v.key, 'drinkCount', Number(e.target.value))}>
                    {[...new Set([...DRINK_COUNTS, v.drinkCount])].sort((a, b) => a - b).map((n) => <option key={n} value={n}>{n === 0 ? 'Aucune' : n}</option>)}
                  </select>
                </div>
              )}
              <button type="button" className="mn-remove" disabled={form.variants.length === 1}
                onClick={() => setForm((f) => ({ ...f, variants: f.variants.filter((x) => x.key !== v.key) }))}
                aria-label={`Retirer la formule ${v.label || i + 1}`} title="Retirer cette formule">×</button>
            </div>
          ))}
        </div>
        {form.variants.length < 8 && (
          <button type="button" className="st-text-btn" onClick={() => setForm((f) => ({ ...f, variants: [...f.variants, emptyVariant()] }))}>+ Ajouter une formule</button>
        )}
      </section>

      <section className="st-box mn-box">
        <h2>Détails</h2>
        <div className="fields">
          <div className="f full">
            <label htmlFor="pf-comp">Composition</label>
            <span className="hint">Ce qui est inclus, une ligne par élément (formules, plateaux, buckets).</span>
            <textarea id="pf-comp" value={form.composition} onChange={set('composition')} rows={3} />
          </div>
          <div className="f">
            <label htmlFor="pf-serves">Pour combien de personnes</label>
            <input id="pf-serves" value={form.serves} onChange={set('serves')} maxLength={40} placeholder="Ex. 2 personnes" />
          </div>
          <label className="mn-check">
            <input type="checkbox" checked={form.isSpicy} onChange={set('isSpicy')} /> Plat épicé
          </label>
          <div className="f">
            <label htmlFor="pf-cl">Choix demandé au client</label>
            <input id="pf-cl" value={form.choiceLabel} onChange={set('choiceLabel')} maxLength={60} placeholder="Ex. Cuisson du poulet" />
          </div>
          <div className="f">
            <label htmlFor="pf-ch">Possibilités</label>
            <textarea id="pf-ch" value={form.choices} onChange={set('choices')} rows={2} placeholder={'Une par ligne, ex.\nGrillé\nFrit'} />
          </div>
        </div>
      </section>

      <div className="mn-bar">
        <button type="submit" className="btn btn-p" disabled={saving}>{saving ? 'Enregistrement…' : isNew ? 'Ajouter le plat' : 'Enregistrer'}</button>
        <Link className="btn btn-s" to={backTo}>Annuler</Link>
      </div>

      {!isNew && (
        <div className="mn-danger">
          {!confirmDelete ? (
            <button type="button" className="st-text-btn danger" onClick={() => setConfirmDelete(true)}>Supprimer ce plat</button>
          ) : (
            <div className="st-action cancel">
              <b>Supprimer « {form.name} » ?</b>
              <p>S'il n'a jamais été commandé, il est supprimé. Sinon, il est retiré du menu et gardé pour l'historique des commandes (vous pourrez le remettre).</p>
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
