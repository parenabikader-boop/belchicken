import { useEffect, useRef, useState } from 'react';
import { MAX_QTY, useCart } from '../context/CartContext.jsx';
import { useMenu } from '../context/MenuContext.jsx';
import { menuDrinks } from '../utils/drinks.js';
import { formatPrice } from '../utils/format.js';
import { photoBg, sizedPhoto } from '../utils/visuals.js';

// Une boisson et son compteur (− 2 +)
function DrinkCounter({ drink, count, onChange, canAdd, price }) {
  const off = !drink.isAvailable;
  return (
    <div className={off ? 'drk off' : 'drk'}>
      <span className="l"><b>{drink.name}</b>{off && <small>Indisponible</small>}</span>
      {price != null && !off && <span className="pp">{formatPrice(price)}</span>}
      <span className="qty">
        <button type="button" onClick={() => onChange(count - 1)} disabled={off || count === 0} aria-label={`Retirer un ${drink.name}`}>−</button>
        <span aria-live="polite">{count}</span>
        <button type="button" onClick={() => onChange(count + 1)} disabled={off || !canAdd} aria-label={`Ajouter un ${drink.name}`}>+</button>
      </span>
    </div>
  );
}

// Fiche produit : formule, boissons comprises, choix éventuel, note pour la cuisine, quantité,
// et boissons à ajouter au prix normal.
export default function ProductDialog({ product: p, onClose }) {
  const { add } = useCart();
  const { categories } = useMenu();
  const drinks = menuDrinks(categories);
  // Boissons comprises dans la formule, pour une formule : { productId: nombre }
  const [included, setIncluded] = useState({});
  // Boissons ajoutées au prix normal (lignes séparées dans le panier) : { productId: nombre }
  const [extras, setExtras] = useState({});
  const [showExtras, setShowExtras] = useState(false);
  const [variantId, setVariantId] = useState(p.variants[0].id);
  const [choice, setChoice] = useState(p.choices.length ? p.choices[0] : null);
  const [note, setNote] = useState('');
  const [qty, setQty] = useState(1);
  const closeRef = useRef(null);

  const variant = p.variants.find((v) => v.id === variantId);
  const drinkCount = variant.drinkCount || 0;
  const chosen = Object.values(included).reduce((n, c) => n + c, 0);
  const missing = drinkCount - chosen;
  const extrasTotal = drinks.reduce((s, d) => s + (extras[d.id] || 0) * d.variants[0].price, 0);
  const pickVariant = (id) => { setVariantId(id); setIncluded({}); };

  useEffect(() => {
    const lastFocus = document.activeElement;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = '';
      document.removeEventListener('keydown', onKey);
      if (lastFocus && document.contains(lastFocus)) lastFocus.focus();
    };
  }, [onClose]);

  const submit = () => {
    if (missing > 0) return;
    const chosenDrinks = Object.entries(included).filter(([, c]) => c > 0).map(([productId, quantity]) => ({ productId, quantity }));
    add({ productId: p.id, variantId, choice, note, quantity: qty, drinks: chosenDrinks });
    for (const d of drinks) if (extras[d.id] > 0) add({ productId: d.id, variantId: d.variants[0].id, quantity: extras[d.id] });
    onClose();
  };

  const meta = [p.category.name, p.number != null && `N° ${p.number}`, p.isSpicy && 'Épicé'].filter(Boolean).join(' · ');

  return (
    <div className="overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dlg" role="dialog" aria-modal="true" aria-labelledby="dlgT">
        <div className="ph" style={{ background: photoBg(p.imageUrl) }}>
          {p.imageUrl && <img {...sizedPhoto(p.imageUrl, 'dialog')} alt={p.name} />}
        </div>
        <div className="in">
          <div className="top">
            <div><div className="meta">{meta}</div><h3 id="dlgT">{p.name}</h3></div>
            <button ref={closeRef} className="x" onClick={onClose} aria-label="Fermer">×</button>
          </div>

          {p.composition.length > 0 ? (
            <table className="incl-t"><tbody>
              {p.composition.map((c, i) => <tr key={i}><td>✓</td><td>{c}</td></tr>)}
            </tbody></table>
          ) : p.description && <p className="muted" style={{ margin: '-6px 0 0' }}>{p.description}</p>}

          {/* Phrase d'explication de la catégorie, retirée de la page Menu */}
          {p.category.description && <p className="dlg-note">{p.category.description}</p>}

          {p.variants.length > 1 && (
            <fieldset><legend>Formule</legend>
              <div className="opts" role="radiogroup">
                {p.variants.map((v) => (
                  <button key={v.id} type="button" className={v.id === variantId ? 'opt on' : 'opt'} role="radio" aria-checked={v.id === variantId} onClick={() => pickVariant(v.id)}>
                    <span className="rd"></span>
                    <span className="l"><b>{v.label}</b>{v.subLabel && <small>{v.subLabel}</small>}</span>
                    <span className="pp">{formatPrice(v.price)}</span>
                  </button>
                ))}
              </div>
            </fieldset>
          )}

          {p.choices.length > 0 && (
            <fieldset><legend>{p.choiceLabel || 'Votre choix'}</legend>
              <div className="opts row" role="radiogroup">
                {p.choices.map((o) => (
                  <button key={o} type="button" className={o === choice ? 'opt on' : 'opt'} role="radio" aria-checked={o === choice} onClick={() => setChoice(o)}>
                    <span className="rd"></span><span className="l"><b>{o}</b></span>
                  </button>
                ))}
              </div>
            </fieldset>
          )}

          {drinkCount === 1 && (
            <fieldset><legend>Votre boisson <span className="muted" style={{ fontWeight: 400 }}>(comprise)</span></legend>
              <div className="opts drk-opts" role="radiogroup">
                {drinks.map((d) => (
                  <button key={d.id} type="button" className={included[d.id] ? 'opt on' : 'opt'} role="radio" aria-checked={Boolean(included[d.id])}
                    disabled={!d.isAvailable} onClick={() => setIncluded({ [d.id]: 1 })}>
                    <span className="rd"></span><span className="l"><b>{d.name}</b>{!d.isAvailable && <small>Indisponible</small>}</span>
                  </button>
                ))}
              </div>
            </fieldset>
          )}

          {drinkCount > 1 && (
            <fieldset><legend>Vos {drinkCount} boissons <span className="muted" style={{ fontWeight: 400 }}>(comprises) · {chosen}/{drinkCount}</span></legend>
              <div className="drks">
                {drinks.map((d) => (
                  <DrinkCounter key={d.id} drink={d} count={included[d.id] || 0} canAdd={missing > 0}
                    onChange={(n) => setIncluded((x) => ({ ...x, [d.id]: n }))} />
                ))}
              </div>
            </fieldset>
          )}

          {/* Boissons en plus, au prix normal (pas sur la fiche d'une boisson) */}
          {!p.category.isDrinks && drinks.some((d) => d.isAvailable) && (
            showExtras ? (
              <fieldset><legend>Ajouter une boisson <span className="muted" style={{ fontWeight: 400 }}>(en plus, prix normal)</span></legend>
                <div className="drks">
                  {drinks.map((d) => (
                    <DrinkCounter key={d.id} drink={d} count={extras[d.id] || 0} canAdd={(extras[d.id] || 0) < MAX_QTY} price={d.variants[0].price}
                      onChange={(n) => setExtras((x) => ({ ...x, [d.id]: n }))} />
                  ))}
                </div>
              </fieldset>
            ) : (
              <button type="button" className="lnk drk-more" onClick={() => setShowExtras(true)}>+ Ajouter une boisson</button>
            )
          )}

          <div>
            <label htmlFor="dn" style={{ fontSize: 14, fontWeight: 700, display: 'block', marginBottom: 6 }}>
              Note pour la cuisine <span className="muted" style={{ fontWeight: 400 }}>(facultatif)</span>
            </label>
            <textarea id="dn" placeholder="Sans oignon, sauce à part…" maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} />
          </div>

          <div className="add-row">
            <span className="qty">
              <button onClick={() => setQty((q) => Math.max(1, q - 1))} aria-label="Diminuer">−</button>
              <span>{qty}</span>
              <button onClick={() => setQty((q) => Math.min(MAX_QTY, q + 1))} aria-label="Augmenter">+</button>
            </span>
            <button className="btn btn-p" onClick={submit} disabled={missing > 0}>
              <span>{missing > 0 ? (drinkCount === 1 ? 'Choisissez votre boisson' : `Encore ${missing} boisson${missing > 1 ? 's' : ''}`) : 'Ajouter'}</span>
              <span>{formatPrice(variant.price * qty + extrasTotal)}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
