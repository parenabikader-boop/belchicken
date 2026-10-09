import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, staffApi } from '../../api/client.js';
import ProductDialog from '../../components/ProductDialog.jsx';
import { CartProvider, useCart, useCartDetails } from '../../context/CartContext.jsx';
import { useMenu } from '../../context/MenuContext.jsx';
import { feeLabel, hourLabel, nightLine, normalize } from '../../utils/deliveryFee.js';
import { formatPrice } from '../../utils/format.js';
import { MOBILE_MONEY } from '../../utils/payment.js';
import { searchProducts } from '../../utils/product.js';
import { formatDateTime } from './labels.js';

// Commande saisie par l'agent (lot 2, réglage « Prise de commande par l'agent ») : appel ou WhatsApp.
// Mêmes informations que sur le site, plus la provenance (jamais « Site », vérifié par le serveur).
// Prix et frais toujours calculés par le serveur ; ensuite, même parcours que le site (paiement vérifié avant).
// Panier à part de celui d'un client (même téléphone), gardé en cas de coupure.
const CART_KEY = 'belchicken.equipe.saisie.v1';

const MODES = [
  { id: 'LIVRAISON', label: 'Livraison' },
  { id: 'A_EMPORTER', label: 'À emporter' },
];
const EMPTY = { sourceId: '', phone: '', name: '', mode: 'LIVRAISON', zone: null, other: false, addr: '', method: null, payer: '' };

// Mêmes règles que le serveur (backend/src/utils/phone.js)
function isPhone(value) {
  const raw = value.trim();
  let digits = raw.replace(/\D/g, '');
  const intl = raw.startsWith('+') || raw.startsWith('00');
  if (raw.startsWith('00')) digits = digits.slice(2);
  if (digits.length === 8) return true;
  if (digits.length === 11 && digits.startsWith('226')) return true;
  return intl && !digits.startsWith('226') && digits.length >= 10 && digits.length <= 15;
}

export default function NewOrder() {
  return (
    <CartProvider storageKey={CART_KEY}>
      <NewOrderForm />
    </CartProvider>
  );
}

function NewOrderForm() {
  const navigate = useNavigate();
  const { clear } = useCart();
  const { items, total, count, ready } = useCartDetails();
  const [ctx, setCtx] = useState(null); // { enabled, sources }
  const [grid, setGrid] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [known, setKnown] = useState(undefined); // undefined : pas cherché ; null : client inconnu
  const [quote, setQuote] = useState(null);
  const [error, setError] = useState(null);
  const [sending, setSending] = useState(false);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  useEffect(() => {
    staffApi.agentContext().then(setCtx, setError);
    api.getDelivery().then(setGrid, () => setGrid({ active: false, zones: [] }));
  }, []);

  // Une seule provenance proposée : choisie d'office
  useEffect(() => {
    if (ctx?.sources.length === 1) set('sourceId', ctx.sources[0].id);
  }, [ctx]);

  // Client retrouvé par son numéro : nom, quartier et repères de sa dernière commande (sans écraser la saisie)
  const lookup = async () => {
    if (!isPhone(form.phone)) return;
    try {
      const c = await staffApi.findCustomer(form.phone);
      setKnown(c);
      if (c) {
        setForm((f) => ({
          ...f,
          name: f.name || c.name,
          addr: f.addr || c.addressNote,
          zone: f.zone || (grid?.active && c.zone && grid.zones.some((z) => z.id === c.zone.id) ? c.zone : null),
        }));
      }
    } catch {
      setKnown(undefined);
    }
  };

  const delivery = form.mode === 'LIVRAISON';
  const gridOn = delivery && Boolean(grid?.active);

  // Aperçu des frais : demandé au serveur à chaque changement de quartier
  useEffect(() => {
    const choice = !gridOn ? null : form.zone ? { zoneId: form.zone.id } : form.other ? { other: true } : null;
    if (!choice) return setQuote(null);
    let alive = true;
    setQuote({ loading: true });
    api.quoteDelivery(choice).then(
      (q) => alive && setQuote(q),
      (e) => alive && setQuote({ error: e.message }),
    );
    return () => {
      alive = false;
    };
  }, [gridOn, form.zone?.id, form.other]); // eslint-disable-line react-hooks/exhaustive-deps

  const blocked = items.some((i) => i.problem);
  const missing = [
    !form.sourceId && 'la provenance',
    !isPhone(form.phone) && 'le numéro WhatsApp du client',
    form.name.trim().length < 2 && 'le nom du client',
    !count && 'au moins un plat',
    gridOn && !form.zone && !form.other && 'le quartier',
    delivery && form.addr.trim().length < 5 && 'le quartier et un repère',
    !form.method && 'l’opérateur mobile money',
    !isPhone(form.payer) && 'le numéro qui paie',
  ].filter(Boolean);

  const submit = async (e) => {
    e.preventDefault();
    if (sending || missing.length || blocked) return;
    setSending(true);
    setError(null);
    try {
      const order = await staffApi.createAgentOrder({
        sourceId: form.sourceId,
        customer: { name: form.name.trim(), phone: form.phone.trim() },
        payment: { method: form.method, payerPhone: form.payer.trim() },
        mode: form.mode,
        ...(delivery && { addressNote: form.addr.trim() }),
        ...(gridOn && {
          delivery: {
            ...(form.zone && { zoneId: form.zone.id }),
            ...(form.other && !form.zone && { other: true }),
            ...(quote && !quote.loading && !quote.error && { expectedFee: quote.fee }),
          },
        }),
        // Jamais de prix : le serveur les recalcule
        items: items.map((l) => ({
          productId: l.productId,
          variantId: l.variantId,
          quantity: l.quantity,
          ...(l.choice && { choice: l.choice }),
          ...(l.note && { note: l.note }),
          ...(l.drinks?.length && { drinks: l.drinks.map((d) => ({ productId: d.productId, quantity: d.quantity })) }),
        })),
      });
      clear();
      navigate(`/equipe/commandes/${order.reference}`);
    } catch (err) {
      setError(err);
      setSending(false);
      // Frais changés entre l'aperçu et l'envoi (prix du Patron, début des heures de nuit) : nouveau montant affiché
      if (err.code === 'FRAIS_CHANGES' && err.details?.quote) setQuote(err.details.quote);
      // Provenance désactivée ou réglage éteint entre-temps : liste à jour
      if (err.code === 'PROVENANCE_REFUSEE' || err.code === 'SAISIE_ETEINTE') staffApi.agentContext().then(setCtx, () => {});
    }
  };

  if (!ctx) {
    return (
      <>
        <Link className="st-back" to="/equipe/commandes">‹ Commandes</Link>
        {error ? <div className="alert err" role="alert"><span>{error.message}</span></div> : <p className="st-muted">Chargement…</p>}
      </>
    );
  }
  if (!ctx.enabled) {
    return (
      <>
        <Link className="st-back" to="/equipe/commandes">‹ Commandes</Link>
        <h1 className="st-title">Nouvelle commande</h1>
        <div className="alert info" style={{ marginTop: 14 }}>
          <span>La prise de commande par l’agent est éteinte. Le Patron peut l’allumer dans Réglages.</span>
        </div>
      </>
    );
  }

  const source = ctx.sources.find((s) => s.id === form.sourceId);

  return (
    <form className="no" onSubmit={submit}>
      <Link className="st-back" to="/equipe/commandes">‹ Commandes</Link>
      <div className="st-head"><h1 className="st-title">Nouvelle commande</h1></div>
      <p className="st-muted no-intro">Commande reçue par appel ou sur WhatsApp. Elle suit ensuite le même parcours que le site : paiement vérifié avant tout.</p>

      <section className="st-box no-sec">
        <h2>1 · Provenance</h2>
        <div className="no-opts" role="radiogroup" aria-label="Provenance">
          {ctx.sources.map((s) => (
            <button key={s.id} type="button" role="radio" aria-checked={form.sourceId === s.id} className={`no-opt${form.sourceId === s.id ? ' on' : ''}`} onClick={() => set('sourceId', s.id)}>
              {s.name}
            </button>
          ))}
        </div>
        {!ctx.sources.length && <p className="st-err">Aucune provenance proposée. Le Patron peut en ajouter dans Réglages.</p>}
        {source?.kind === 'WHATSAPP' && source.phone && (
          <p className="nt-from"><b>Vous écrirez au client depuis WhatsApp {source.phone.replace(/^\+226(\d{2})(\d{2})(\d{2})(\d{2})$/, '+226 $1 $2 $3 $4')}</b></p>
        )}
      </section>

      <section className="st-box no-sec">
        <h2>2 · Client</h2>
        <div className="fields">
          <div className="f">
            <label htmlFor="no-phone">Numéro WhatsApp du client</label>
            <input
              id="no-phone" type="tel" inputMode="tel" autoComplete="off" placeholder="ex. 70 12 34 56" value={form.phone}
              onChange={(e) => { set('phone', e.target.value); setKnown(undefined); }} onBlur={lookup}
            />
            {known && <span className="hint no-known">Client connu : {known.ordersCount} commande{known.ordersCount > 1 ? 's' : ''}, la dernière le {formatDateTime(known.lastOrderAt)}. Nom et adresse repris : vérifiez-les avec lui.</span>}
            {known === null && <span className="hint">Nouveau client.</span>}
          </div>
          <div className="f">
            <label htmlFor="no-name">Nom du client</label>
            <input id="no-name" type="text" autoComplete="off" maxLength={80} value={form.name} onChange={(e) => set('name', e.target.value)} />
          </div>
        </div>
        <div className="no-opts" role="radiogroup" aria-label="Livraison ou à emporter" style={{ marginTop: 14 }}>
          {MODES.map((m) => (
            <button key={m.id} type="button" role="radio" aria-checked={form.mode === m.id} className={`no-opt${form.mode === m.id ? ' on' : ''}`} onClick={() => set('mode', m.id)}>
              {m.label}
            </button>
          ))}
        </div>
      </section>

      <section className="st-box no-sec">
        <h2>3 · Plats</h2>
        <Dishes />
        <Basket items={items} total={total} ready={ready} />
      </section>

      {delivery && (
        <section className="st-box no-sec">
          <h2>4 · Livraison</h2>
          {gridOn && <Zones grid={grid} form={form} setForm={setForm} quote={quote} />}
          <div className="f" style={{ marginTop: gridOn ? 14 : 0 }}>
            <label htmlFor="no-addr">Quartier et repères</label>
            <textarea id="no-addr" maxLength={300} placeholder="Ex. : Kamsonghin, rue derrière la pharmacie, portail bleu" value={form.addr} onChange={(e) => set('addr', e.target.value)} />
          </div>
          {!gridOn && <p className="st-muted" style={{ marginTop: 8 }}>Frais de livraison : à donner en confirmant le paiement, comme pour le site.</p>}
        </section>
      )}

      <section className="st-box no-sec">
        <h2>{delivery ? '5' : '4'} · Paiement des plats</h2>
        <div className="no-opts" role="radiogroup" aria-label="Opérateur mobile money">
          {MOBILE_MONEY.map((m) => (
            <button key={m.id} type="button" role="radio" aria-checked={form.method === m.id} className={`no-opt${form.method === m.id ? ' on' : ''}`} onClick={() => set('method', m.id)}>
              {m.label}
            </button>
          ))}
        </div>
        <div className="f" style={{ marginTop: 14 }}>
          <label htmlFor="no-payer">Numéro qui paie</label>
          <span className="hint">Le numéro mobile money que vous vérifierez sur le téléphone marchand.</span>
          <div className="no-payer">
            <input id="no-payer" type="tel" inputMode="tel" autoComplete="off" value={form.payer} onChange={(e) => set('payer', e.target.value)} />
            {isPhone(form.phone) && form.payer !== form.phone && (
              <button type="button" className="btn btn-s" onClick={() => set('payer', form.phone)}>Même numéro que le client</button>
            )}
          </div>
        </div>
      </section>

      <div className="no-submit">
        <p className="no-total">Total des plats : <b>{formatPrice(total)}</b>{delivery && <span> · frais de livraison à part</span>}</p>
        {missing.length > 0 && <p className="st-muted">À compléter : {missing.join(', ')}.</p>}
        {blocked && <p className="st-err">Un plat du panier n’est plus disponible : retirez-le.</p>}
        {error && <div className="alert err" role="alert"><span>{error.message}</span></div>}
        <button type="submit" className="btn btn-p" disabled={sending || missing.length > 0 || blocked}>
          {sending ? 'Enregistrement…' : 'Enregistrer la commande'}
        </button>
      </div>
    </form>
  );
}

// Recherche rapide (nom, numéro, composition) ou catégorie, puis la fiche du plat comme sur le site
function Dishes() {
  const { categories, status, error, reload } = useMenu();
  const [q, setQ] = useState('');
  const [cat, setCat] = useState(null);
  const [open, setOpen] = useState(null);
  const shown = useMemo(() => {
    if (q.trim()) return searchProducts(categories, q);
    const c = categories.find((x) => x.id === cat) || categories[0];
    return c ? c.products.map((p) => ({ ...p, category: c })) : [];
  }, [categories, q, cat]);

  if (status === 'error') return <p className="st-err">{error.message} <button type="button" className="st-text-btn" onClick={reload}>Réessayer</button></p>;
  if (status !== 'ready') return <p className="st-muted">Chargement du menu…</p>;
  const current = cat || categories[0]?.id;

  return (
    <>
      <label className="st-search">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
        <input type="search" placeholder="Nom ou numéro du plat (ex. 7)" aria-label="Rechercher un plat" value={q} onChange={(e) => setQ(e.target.value)} />
      </label>
      {!q.trim() && (
        <div className="st-chips">
          {categories.map((c) => (
            <button key={c.id} type="button" className={`st-chip${c.id === current ? ' on' : ''}`} onClick={() => setCat(c.id)}>{c.name}</button>
          ))}
        </div>
      )}
      <ul className="no-dishes">
        {shown.map((p) => (
          <li key={p.id}>
            <button type="button" disabled={!p.isAvailable} onClick={() => setOpen(p)}>
              <span><b>{p.number != null && `N° ${p.number} · `}{p.name}</b>{!p.isAvailable && <small>Indisponible</small>}</span>
              <span className="no-price">{p.variants.length > 1 ? `dès ${formatPrice(Math.min(...p.variants.map((v) => v.price)))}` : formatPrice(p.variants[0].price)}</span>
            </button>
          </li>
        ))}
        {q.trim() && !shown.length && <li className="st-muted">Aucun plat ne correspond à « {q.trim()} ».</li>}
      </ul>
      {open && <ProductDialog product={open} onClose={() => setOpen(null)} />}
    </>
  );
}

function Basket({ items, total, ready }) {
  const { changeQty, remove } = useCart();
  if (!ready) return null;
  if (!items.length) return <p className="st-muted no-empty">Aucun plat pour l’instant.</p>;
  return (
    <div className="no-basket">
      <h3>Commande</h3>
      <ul>
        {items.map((i) => (
          <li key={i.key} className={i.problem ? 'bad' : undefined}>
            <span className="no-line">
              <b>{i.product.number != null && `N° ${i.product.number} · `}{i.product.name}</b>
              {i.options && <small>{i.options}</small>}
              {i.problem && <small className="st-err">{i.problem}</small>}
            </span>
            <span className="qty">
              <button type="button" onClick={() => changeQty(i.key, -1)} aria-label="Retirer un">−</button>
              <span>{i.quantity}</span>
              <button type="button" onClick={() => changeQty(i.key, 1)} aria-label="Ajouter un">+</button>
            </span>
            <span className="no-amount">{formatPrice(i.amount)}</span>
            <button type="button" className="st-text-btn danger" onClick={() => remove(i.key)}>Retirer</button>
          </li>
        ))}
      </ul>
      <p className="no-total">Total des plats : <b>{formatPrice(total)}</b></p>
    </div>
  );
}

// Quartiers de la grille du Patron, avec recherche, et « Autre quartier » s'il est proposé
function Zones({ grid, form, setForm, quote }) {
  const [q, setQ] = useState('');
  const zones = grid.zones.filter((z) => normalize(z.name).includes(normalize(q)));
  const pick = (zone, other) => setForm((f) => ({ ...f, zone, other }));
  // Lot 3 : la nuit, le prix affiché comprend le supplément de nuit du quartier
  const isNight = Boolean(grid.night?.isNight);
  return (
    <div className="zone" style={{ marginTop: 0 }}>
      <label htmlFor="no-zone-q" className="zone-l">Quartier du client</label>
      {isNight && <span className="hint night-hint">Supplément de nuit compris dans les prix, de {hourLabel(grid.night.from)} à {hourLabel(grid.night.to)}.</span>}
      <input id="no-zone-q" type="search" className="zone-q" placeholder="Rechercher le quartier" value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off" />
      <div className="zone-list" role="radiogroup" aria-label="Quartier">
        {zones.map((z) => {
          const on = form.zone?.id === z.id;
          const night = isNight ? z.nightFee || 0 : 0;
          const fee = z.fee + night;
          return (
            <button key={z.id} type="button" role="radio" aria-checked={on} className={`zone-opt${on ? ' on' : ''}`} onClick={() => pick(on ? null : { id: z.id, name: z.name }, false)}>
              <span className="rd" aria-hidden="true" />
              <span className="zone-n">{z.name}{night > 0 && <small>{nightLine(night)}</small>}</span>
              <b className={fee === 0 ? 'free' : undefined}>{feeLabel(fee)}</b>
            </button>
          );
        })}
        {grid.allowOther && (
          <button type="button" role="radio" aria-checked={form.other} className={`zone-opt other${form.other ? ' on' : ''}`} onClick={() => pick(null, !form.other)}>
            <span className="rd" aria-hidden="true" />
            <span className="zone-n">Autre quartier</span>
            <b>À confirmer</b>
          </button>
        )}
      </div>
      {quote?.error && <p className="st-err">{quote.error}</p>}
      {quote && quote.fee != null && !quote.loading && <p className="st-muted">Frais de livraison : <b>{feeLabel(quote.fee)}</b>{quote.nightFee ? `, ${nightLine(quote.nightFee)}` : ''}, payés au livreur à la réception.</p>}
    </div>
  );
}
