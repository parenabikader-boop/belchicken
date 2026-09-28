import { useEffect, useRef, useState } from 'react';
import { MAX_QTY, useCart } from '../context/CartContext.jsx';
import { formatPrice } from '../utils/format.js';
import { photoBg } from '../utils/visuals.js';

// Fiche produit : formule, choix éventuel, note pour la cuisine, quantité.
export default function ProductDialog({ product: p, onClose }) {
  const { add } = useCart();
  const [variantId, setVariantId] = useState(p.variants[0].id);
  const [choice, setChoice] = useState(p.choices.length ? p.choices[0] : null);
  const [note, setNote] = useState('');
  const [qty, setQty] = useState(1);
  const closeRef = useRef(null);

  const variant = p.variants.find((v) => v.id === variantId);

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
    add({ productId: p.id, variantId, choice, note, quantity: qty });
    onClose();
  };

  const meta = [p.category.name, p.number != null && `N° ${p.number}`, p.isSpicy && 'Épicé'].filter(Boolean).join(' · ');

  return (
    <div className="overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dlg" role="dialog" aria-modal="true" aria-labelledby="dlgT">
        <div className="ph" style={{ background: photoBg(p.imageUrl) }}>
          {p.imageUrl && <img src={p.imageUrl} alt={p.name} />}
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
                  <button key={v.id} type="button" className={v.id === variantId ? 'opt on' : 'opt'} role="radio" aria-checked={v.id === variantId} onClick={() => setVariantId(v.id)}>
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
            <button className="btn btn-p" onClick={submit}><span>Ajouter</span><span>{formatPrice(variant.price * qty)}</span></button>
          </div>
        </div>
      </div>
    </div>
  );
}
