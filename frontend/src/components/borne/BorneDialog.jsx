import { useEffect, useMemo, useRef, useState } from 'react';
import { MAX_QTY, useCart } from '../../context/CartContext.jsx';
import { useMenu } from '../../context/MenuContext.jsx';
import { menuDrinks } from '../../utils/drinks.js';
import { formatPrice } from '../../utils/format.js';
import { photoBg, sizedPhoto } from '../../utils/visuals.js';
import { addIncluded, addonSections, cartLines, dialogTotal, includedState, removeIncluded } from '../../utils/borne.js';
import { useT } from '../../i18n/index.jsx';
import BorneRow from './BorneRow.jsx';
import { OptionCard } from './BorneCard.jsx';

// Lot 11 : écran de personnalisation façon borne (façon A). Plein écran sur téléphone, grand panneau ailleurs.
// Barre du haut (Retour) et barre du bas (quantité, « Ajouter · prix ») toujours visibles.
// Formule, choix, boissons comprises, puis suppléments en rangées : chaque supplément part au panier en ligne
// à part (prix du serveur), comme les « boissons en plus » de la fiche actuelle (ProductDialog.jsx).
export default function BorneDialog({ product: p, onClose }) {
  const { add } = useCart();
  const { categories } = useMenu();
  const t = useT();
  const B = t.borne;
  const [variantId, setVariantId] = useState(p.variants[0].id);
  const [choice, setChoice] = useState(p.choices.length ? p.choices[0] : null);
  const [included, setIncluded] = useState({});
  const [extras, setExtras] = useState({});
  const [note, setNote] = useState('');
  const [showNote, setShowNote] = useState(false);
  const [qty, setQty] = useState(1);
  const backRef = useRef(null);

  const variant = p.variants.find((v) => v.id === variantId);
  const drinkCount = variant.drinkCount || 0;
  const { chosen, missing } = includedState(drinkCount, included);
  const drinks = menuDrinks(categories);
  const sections = useMemo(() => addonSections(categories, p, { drinksTitle: B.extraDrinks, othersLabel: t.menu.others }), [categories, p, B.extraDrinks, t.menu.others]);
  const total = dialogTotal(variant, qty, extras, sections);

  useEffect(() => {
    const lastFocus = document.activeElement;
    document.body.style.overflow = 'hidden';
    backRef.current?.focus();
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = '';
      document.removeEventListener('keydown', onKey);
      if (lastFocus && document.contains(lastFocus)) lastFocus.focus();
    };
  }, [onClose]);

  const pickVariant = (id) => {
    setVariantId(id);
    setIncluded({});
  };
  const setExtra = (key, n) => setExtras((x) => ({ ...x, [key]: Math.max(0, Math.min(MAX_QTY, n)) }));

  const submit = () => {
    if (missing > 0) return;
    for (const line of cartLines({ product: p, variantId, choice, note, qty, included, extras, sections })) add(line);
    onClose();
  };

  const meta = [p.category.name, p.number != null && t.common.number(p.number), p.isSpicy && t.common.spicy].filter(Boolean).join(' · ');

  return (
    <div className="kb-ov" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="kb-dlg" role="dialog" aria-modal="true" aria-labelledby="kbT">
        <div className="kb-dlg-top">
          <button ref={backRef} type="button" className="kb-back" onClick={onClose}>
            <span aria-hidden="true">←</span> {B.back}
          </button>
          <b className="kb-dlg-title">{p.name}</b>
        </div>

        <div className="kb-dlg-body">
          <div className="kb-hero">
            <div className="kb-hero-ph" style={{ background: photoBg(p.imageUrl) }}>
              {p.imageUrl && <img {...sizedPhoto(p.imageUrl, 'dialog')} alt={p.name} />}
            </div>
            <div className="kb-hero-txt">
              {meta && <div className="kb-meta">{meta}</div>}
              <h2 id="kbT">{p.name}</h2>
              <div className="kb-hero-price">{formatPrice(variant.price)}</div>
              {p.composition.length > 0 ? (
                <ul className="kb-compo">{p.composition.map((c, i) => <li key={i}>{c}</li>)}</ul>
              ) : p.description && <p className="muted">{p.description}</p>}
              {p.category.description && <p className="kb-cat-note">{p.category.description}</p>}
            </div>
          </div>

          {p.variants.length > 1 && (
            <section className="kb-sec2">
              <h3>{t.dialog.formula}</h3>
              <div className="kb-opts" role="radiogroup" aria-label={t.dialog.formula}>
                {p.variants.map((v) => (
                  <button key={v.id} type="button" role="radio" aria-checked={v.id === variantId} className={v.id === variantId ? 'kb-opt on' : 'kb-opt'} onClick={() => pickVariant(v.id)}>
                    <b>{v.label}</b>
                    {v.subLabel && <small>{v.subLabel}</small>}
                    <span>{formatPrice(v.price)}</span>
                  </button>
                ))}
              </div>
            </section>
          )}

          {p.choices.length > 0 && (
            <section className="kb-sec2">
              <h3>{p.choiceLabel || t.dialog.yourChoice}</h3>
              <div className="kb-opts" role="radiogroup" aria-label={p.choiceLabel || t.dialog.yourChoice}>
                {p.choices.map((o) => (
                  <button key={o} type="button" role="radio" aria-checked={o === choice} className={o === choice ? 'kb-opt on' : 'kb-opt'} onClick={() => setChoice(o)}>
                    <b>{o}</b>
                  </button>
                ))}
              </div>
            </section>
          )}

          {drinkCount > 0 && (
            <section className="kb-sec2">
              <BorneRow
                title={B.includedDrinks(drinkCount)}
                note={missing > 0 ? B.toChoose(missing) : B.chosen}
                label={B.includedDrinks(drinkCount)}
                className={missing > 0 ? 'kb-need' : 'kb-done'}
              >
                {drinks.map((d) => (
                  <OptionCard key={d.id} name={d.name} imageUrl={d.imageUrl} price={null} count={included[d.id] || 0} available={d.isAvailable}
                    canAdd={missing > 0 || drinkCount === 1}
                    onAdd={() => setIncluded((x) => addIncluded(x, d.id, drinkCount))}
                    onRemove={() => setIncluded((x) => removeIncluded(x, d.id))} />
                ))}
              </BorneRow>
              {drinkCount > 1 && <p className="kb-hint">{t.dialog.includedCount(chosen, drinkCount)}</p>}
            </section>
          )}

          {sections.map((s) => (
            <section className="kb-sec2" key={s.key}>
              <BorneRow title={s.title} note={B.extraNote} label={s.title}>
                {s.items.map((i) => (
                  <OptionCard key={i.key} name={i.name} imageUrl={i.imageUrl} price={i.price} count={extras[i.key] || 0} available={i.isAvailable}
                    canAdd={(extras[i.key] || 0) < MAX_QTY}
                    onAdd={() => setExtra(i.key, (extras[i.key] || 0) + 1)}
                    onRemove={() => setExtra(i.key, (extras[i.key] || 0) - 1)} />
                ))}
              </BorneRow>
            </section>
          ))}

          <section className="kb-sec2">
            {showNote ? (
              <>
                <label htmlFor="kbN" className="kb-note-l">{t.dialog.kitchenNote}<span className="muted">{t.common.optional}</span></label>
                <textarea id="kbN" className="kb-note" placeholder={t.dialog.notePlaceholder} maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} autoFocus />
              </>
            ) : (
              <button type="button" className="lnk kb-note-btn" onClick={() => setShowNote(true)}>{B.addNote}</button>
            )}
          </section>
        </div>

        <div className="kb-dlg-bar">
          <span className="kb-count big">
            <button type="button" onClick={() => setQty((q) => Math.max(1, q - 1))} disabled={qty <= 1} aria-label={t.common.decrease}>−</button>
            <span aria-live="polite">{qty}</span>
            <button type="button" onClick={() => setQty((q) => Math.min(MAX_QTY, q + 1))} disabled={qty >= MAX_QTY} aria-label={t.common.increase}>+</button>
          </span>
          <button type="button" className="btn btn-p kb-add" onClick={submit} disabled={missing > 0}>
            <span>{missing > 0 ? (drinkCount === 1 ? t.dialog.chooseDrink : t.dialog.moreDrinks(missing)) : t.dialog.add}</span>
            <span aria-live="polite">{formatPrice(total)}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
