import { useEffect, useState } from 'react';
import { staffApi } from '../../api/client.js';
import { formatPrice } from '../../utils/format.js';
import { hourLabel, nightLine } from '../../utils/deliveryFee.js';
import { useStaff } from '../StaffContext.jsx';
import { useAppSettings } from '../settings/useAppSettings.js';
import { ACTIVE, canEditFee, deliveryBlock, feeOrigin, feeText, FEE_METHODS, formatPhone, formatTime, isPickup, METHOD_LABEL, nextAction } from './labels.js';

// « 1 500 » -> 1500 ; champ vide -> NaN (jamais 0 par erreur : 0 F = livraison offerte)
const toAmount = (v) => (v.trim() === '' ? NaN : Number(v.replace(/\s/g, '')));
// « dont supplément de nuit » (lot 3) : vide = aucun (null)
const toNight = (v) => (v.trim() === '' ? null : Number(v.replace(/\s/g, '')));
const nightInput = (n) => (n ? String(n) : '');
// Supplément valide : vide, ou un nombre entier entre 0 et le total des frais
const nightOk = (night, amount) => night == null || (Number.isInteger(night) && night >= 0 && night <= amount);

// Lot 3 : champ facultatif « dont supplément de nuit », avec un rappel pour une commande passée de nuit
function NightFeeField({ order: o, id, value, onChange, amount }) {
  const night = toNight(value);
  return (
    <div className="of-night">
      {o.nightOrder && (
        <p className="st-note">
          Commande passée de nuit ({hourLabel(o.nightOrder.from)} – {hourLabel(o.nightOrder.to)}) : pensez au supplément de nuit.
        </p>
      )}
      <label htmlFor={id} className="st-fee-label">Dont supplément de nuit (facultatif)</label>
      <span className="of-amount">
        <input id={id} type="text" inputMode="numeric" autoComplete="off" placeholder="0" value={value} onChange={(e) => onChange(e.target.value.replace(/[^\d\s]/g, ''))} />
        <span>F</span>
      </span>
      {!nightOk(night, amount) && Number.isInteger(amount) && <p className="st-err">Le supplément de nuit ne peut pas dépasser les frais ({formatPrice(amount)}).</p>}
    </div>
  );
}

// Étapes d'une commande : un seul bouton par étape, qui enregistre l'étape ET ouvre WhatsApp avec le
// message du client. L'étape suivante reste bloquée (ici et par l'API) tant que l'agent n'a pas
// confirmé l'envoi (« Oui, envoyé » ou « Client prévenu par appel »).
// Avec l'envoi automatique (notice.auto), WhatsApp ne s'ouvre pas et rien n'est demandé.

// Ouvre WhatsApp après une action. La fenêtre est ouverte tout de suite, pendant le toucher
// (sinon le téléphone la bloque), puis dirigée vers le message une fois l'étape enregistrée.
async function withWhatsApp(action, auto) {
  const win = auto ? null : window.open('', '_blank');
  try {
    win?.document.write('<p style="font:18px sans-serif;padding:24px">Ouverture de WhatsApp…</p>');
  } catch {
    /* fenêtre déjà ailleurs : rien à écrire */
  }
  try {
    const next = await action();
    const n = next.notice;
    const open = Boolean(win && n?.url && n.required);
    if (open) {
      win.location.href = n.url;
      staffApi.logMessage(next.reference, n.key).catch(() => {});
    } else {
      win?.close();
    }
    return { next, opened: open };
  } catch (e) {
    win?.close();
    throw e;
  }
}

// État partagé par les boutons d'étape et la question « Avez-vous envoyé le message ? »
export function useSteps(order, onChange, onConflict) {
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const auto = Boolean(order.notice?.auto);

  // Nouvelle étape (par nous ou un collègue) : la question ne vaut que pour le message en cours
  const key = order.notice?.key;
  const required = order.notice?.required;
  useEffect(() => {
    if (!required) setAsking(false);
  }, [key, required]);

  const run = async (action, { whatsapp = true } = {}) => {
    setBusy(true);
    setError('');
    try {
      if (whatsapp) {
        const { next, opened } = await withWhatsApp(action, auto);
        onChange(next);
        // WhatsApp ouvert : la question attend l'agent à son retour. Ouverture bloquée par le
        // téléphone : le message reste affiché avec son bouton « Ouvrir WhatsApp ».
        setAsking(opened);
      } else {
        onChange(await action());
      }
      setBusy(false);
      return true;
    } catch (e) {
      setError(e.message);
      setBusy(false);
      // Code de retrait faux : on recharge pour le nombre d'essais (et le blocage après 5)
      if (e.status === 409 || e.code === 'CODE_INCORRECT') onConflict();
      return false;
    }
  };

  return { run, busy, error, asking, setAsking };
}

// Commande arrivée par un WhatsApp du restaurant (lot 2) : l'agent écrit au client depuis ce numéro, à chaque
// étape. Rien pour une commande du site ou un appel.
export function SendFrom({ order: o }) {
  if (!o.sendFrom) return null;
  return <p className="nt-from" role="note"><b>{o.sendFrom.text}</b></p>;
}

// Message de l'étape en cours : à envoyer, à confirmer, ou déjà confirmé
export function Notice({ order: o, steps, onChange }) {
  const n = o.notice;
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  if (!n) return null;

  const confirm = async (by) => {
    setSending(true);
    setError('');
    try {
      onChange(await staffApi.confirmNotice(o.reference, n.key, by));
      steps.setAsking(false);
    } catch (e) {
      setError(e.message);
    }
    setSending(false);
  };

  if (n.auto) {
    return <p className="nt nt-done">Message « {n.label} » envoyé automatiquement au client sur WhatsApp.</p>;
  }

  // Message facultatif pas encore envoyé (« commande à payer » d'une commande saisie par un agent) :
  // proposé avec son bouton, sans bloquer l'étape suivante
  if (n.optional && !n.confirmed) {
    return (
      <section className="nt nt-todo nt-optional" aria-live="polite">
        <h2>Envoyer au client (facultatif) : {n.label}</h2>
        <SendFrom order={o} />
        <p className="of-bubble">{n.text}</p>
        <div className="nt-row">
          <a className="btn btn-wa" href={n.url} target="_blank" rel="noreferrer" onClick={() => staffApi.logMessage(o.reference, n.key).catch(() => {})}>
            Envoyer au client{o.sendFrom && <small>depuis WhatsApp {o.sendFrom.phone}</small>}
          </a>
          <button type="button" className="btn btn-s" disabled={sending} onClick={() => confirm('WHATSAPP')}>C’est envoyé</button>
        </div>
        <p className="st-muted">Pas obligatoire : au téléphone, vous pouvez aussi donner le code marchand de vive voix.</p>
        {error && <p className="st-err">{error}</p>}
      </section>
    );
  }

  if (!n.required) {
    const by = n.confirmed?.type === 'CLIENT_APPELE' ? 'par appel' : 'sur WhatsApp';
    return (
      <p className="nt nt-done">
        <span>✓ Client prévenu {by} : « {n.label} »{n.confirmed && <> · {formatTime(n.confirmed.at)}{n.confirmed.by && ` par ${n.confirmed.by}`}</>}</span>
        {o.sendFrom && <span className="nt-from-inline">{o.sendFrom.text}</span>}
        {n.url && <a href={n.url} target="_blank" rel="noreferrer" onClick={() => staffApi.logMessage(o.reference, n.key).catch(() => {})}>Renvoyer</a>}
      </p>
    );
  }

  const openAgain = () => {
    staffApi.logMessage(o.reference, n.key).catch(() => {});
    steps.setAsking(true);
  };

  if (n.missing) {
    return (
      <section className="nt nt-todo" aria-live="polite">
        <h2>Prévenir le client</h2>
        <p className="st-verify-hint">{n.missing}</p>
      </section>
    );
  }

  return (
    <section className={`nt nt-todo${steps.asking ? ' asking' : ''}`} aria-live="polite">
      {steps.asking ? (
        <>
          <h2>Avez-vous envoyé le message au client ?</h2>
          <p className="nt-sub">« {n.label} » à {o.customerName} ({formatPhone(o.customerPhone)})</p>
          <SendFrom order={o} />
          <div className="nt-row">
            <button type="button" className="btn btn-p" disabled={sending} onClick={() => confirm('WHATSAPP')}>Oui, envoyé</button>
            <button type="button" className="btn btn-s" disabled={sending} onClick={() => steps.setAsking(false)}>Pas encore</button>
          </div>
        </>
      ) : (
        <>
          <h2>Prévenez le client : {n.label}</h2>
          <SendFrom order={o} />
          <p className="of-bubble">{n.text}</p>
          <div className="nt-row">
            <a className="btn btn-wa" href={n.url} target="_blank" rel="noreferrer" onClick={openAgain}>Ouvrir WhatsApp avec ce message{o.sendFrom && <small>depuis WhatsApp {o.sendFrom.phone}</small>}</a>
            <button type="button" className="btn btn-s" disabled={sending} onClick={() => confirm('WHATSAPP')}>C’est envoyé</button>
          </div>
        </>
      )}
      <button type="button" className="st-text-btn nt-call" disabled={sending} onClick={() => confirm('APPEL')}>
        Client sans WhatsApp : prévenu par appel
      </button>
      {error && <p className="st-err">{error}</p>}
    </section>
  );
}

// Bouton de l'étape suivante (avec confirmation pour le paiement et les frais) et annulation
export function Actions({ order: o, steps }) {
  const { shortFlow, loaded } = useAppSettings();
  const next = nextAction(o, { shortFlow });
  const pickup = isPickup(o);
  const [mode, setMode] = useState(null); // null | 'confirm' | 'depart' | 'handover' | 'counter' | 'cancel'
  const [reason, setReason] = useState('');
  const [fee, setFee] = useState('');
  const [feeReason, setFeeReason] = useState('');
  const [night, setNight] = useState('');
  const [courierId, setCourierId] = useState('');
  const [feeMethod, setFeeMethod] = useState('');
  const [code, setCode] = useState('');

  // Changement de statut (par nous ou un collègue) : on referme ce qui était ouvert
  useEffect(() => {
    setMode(null);
  }, [o.status]);

  if (!ACTIVE.includes(o.status)) return null;
  // Commande arrivée par un WhatsApp du restaurant : chaque message part de ce numéro (lot 2)
  const fromHint = <SendFrom order={o} />;

  const notified = !o.notice?.required;
  const blocked = !notified
    ? 'Prévenez d’abord le client : confirmez l’envoi du message ci-dessus.'
    : o.status === 'EN_PREPARATION' && !pickup ? deliveryBlock(o) : null;
  const go = (call) => steps.run(call);
  const amount = toAmount(fee);
  // Frais calculés par la grille et changés par l'agent : c'est une correction, avec un motif
  const gridFee = o.deliveryFee;
  const changed = !pickup && gridFee != null && amount !== gridFee;
  // Frais tapés par l'agent (à confirmer, grille vide, ou changés) : « dont supplément de nuit » facultatif
  const typed = !pickup && (gridFee == null || changed);
  const nightFee = toNight(night);
  const feeOk = pickup || ((Number.isInteger(amount) && (amount === gridFee || amount >= 1)) && (!changed || feeReason.trim().length >= 3) && (!typed || nightOk(nightFee, amount)));

  if (mode === 'confirm' && o.status === 'PAIEMENT_A_VERIFIER') {
    return (
      <form className="st-action confirm" onSubmit={(e) => { e.preventDefault(); go(() => staffApi.setStatus(o.reference, { from: o.status, to: next.to, ...(pickup ? {} : { deliveryFee: amount, ...(changed ? { feeReason } : {}), ...(typed ? { nightFee } : {}) }) })); }}>
        <b>Avez-vous vérifié le paiement sur le téléphone marchand ?</b>
        <p>
          <strong>{formatPrice(o.itemsTotal)}</strong> reçus par {METHOD_LABEL[o.paymentMethod]}
          {o.paymentPayerPhone && <> depuis le <strong>{formatPhone(o.paymentPayerPhone)}</strong></>}.
        </p>
        {pickup ? (
          <p className="st-muted">Commande à emporter : pas de frais de livraison.</p>
        ) : (
          <>
            <label htmlFor="st-fee" className="st-fee-label">
              {gridFee != null
                ? `Frais de livraison calculés par le site : ${feeText(gridFee)} (annoncés dans le message)`
                : o.deliveryFeeSource === 'A_CONFIRMER'
                  ? 'Frais à confirmer : appelez le client, puis tapez le montant convenu (annoncé dans le message)'
                  : 'Frais de livraison pour le quartier du client (annoncés dans le message)'}
            </label>
            {feeOrigin(o) && <p className="st-muted">{feeOrigin(o)}.</p>}
            {gridFee != null && o.deliveryNightFee > 0 && !changed && <p className="st-muted">{nightLine(o.deliveryNightFee)}.</p>}
            <span className="of-amount">
              <input id="st-fee" type="text" inputMode="numeric" autoComplete="off" placeholder="ex. 1000" value={fee} onChange={(e) => setFee(e.target.value.replace(/[^\d\s]/g, ''))} autoFocus={gridFee == null} />
              <span>F</span>
            </span>
            {changed && (
              <>
                <label htmlFor="st-fee-reason" className="st-fee-label">Pourquoi changer les frais calculés ?</label>
                <textarea id="st-fee-reason" value={feeReason} onChange={(e) => setFeeReason(e.target.value)} maxLength={300} placeholder="Ex. : client en dehors du quartier choisi…" />
              </>
            )}
            {typed && <NightFeeField order={o} id="st-fee-night" value={night} onChange={setNight} amount={amount} />}
          </>
        )}
        {steps.error && <p className="st-err">{steps.error}</p>}
        {fromHint}
        <div className="st-action-row">
          <button type="submit" className="btn btn-p" disabled={steps.busy || !feeOk}>{steps.busy ? 'Enregistrement…' : next.to === 'EN_PREPARATION' ? 'Oui, paiement reçu : lancer la préparation et prévenir le client' : 'Oui, paiement reçu : prévenir le client'}</button>
          <button type="button" className="st-text-btn" onClick={() => setMode(null)}>Retour</button>
        </div>
      </form>
    );
  }

  // Départ : choix du livreur. Le code de remise est créé et ajouté au message « en route ».
  if (mode === 'depart' && o.status === 'EN_PREPARATION') {
    return (
      <form className="st-action confirm" onSubmit={(e) => { e.preventDefault(); go(() => staffApi.setStatus(o.reference, { from: o.status, to: 'EN_LIVRAISON', courierId })); }}>
        <b>Quel livreur part avec la commande ?</b>
        <CourierPicker value={courierId} onChange={setCourierId} />
        <p className="st-muted">Il reçoit une notification. Le client reçoit le code de remise dans le message « en route ».</p>
        {steps.error && <p className="st-err">{steps.error}</p>}
        {fromHint}
        <div className="st-action-row">
          <button type="submit" className="btn btn-p" disabled={steps.busy || !courierId}>{steps.busy ? 'Enregistrement…' : 'Partie en livraison : prévenir le client'}</button>
          <button type="button" className="st-text-btn" onClick={() => setMode(null)}>Retour</button>
        </div>
      </form>
    );
  }

  // Client sans son code : l'agent valide à la place du livreur, avec un motif et la façon dont
  // les frais ont été payés au livreur (comme le livreur le fait avec le code)
  if (mode === 'handover' && o.status === 'EN_LIVRAISON') {
    const needMethod = !o.feeAlreadyPaid && o.deliveryFee !== 0; // rien à encaisser pour une livraison offerte
    return (
      <form className="st-action cancel" onSubmit={async (e) => { e.preventDefault(); if (await go(() => staffApi.setStatus(o.reference, { from: o.status, to: 'LIVREE', reason, feeMethod: needMethod ? feeMethod : undefined }))) setReason(''); }}>
        <label htmlFor="st-handover"><b>Pourquoi valider la livraison sans le code ?</b></label>
        <textarea id="st-handover" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} placeholder="Ex. : client a effacé le message, livreur a vérifié par appel…" autoFocus />
        {needMethod ? (
          <FeeMethodPicker fee={o.deliveryFee} value={feeMethod} onChange={setFeeMethod} />
        ) : (
          <p className="st-muted">{o.deliveryFee === 0 ? 'Livraison offerte : rien à encaisser.' : 'Frais de livraison déjà payés avant le départ du livreur.'}</p>
        )}
        <p className="st-muted">À faire seulement si la commande a bien été remise. Le motif est noté dans l’historique.</p>
        {steps.error && <p className="st-err">{steps.error}</p>}
        {fromHint}
        <div className="st-action-row">
          <button type="submit" className="btn btn-p" disabled={steps.busy || reason.trim().length < 3 || (needMethod && !feeMethod)}>{steps.busy ? 'Enregistrement…' : 'Valider la livraison et remercier le client'}</button>
          <button type="button" className="st-text-btn" onClick={() => setMode(null)}>Retour</button>
        </div>
      </form>
    );
  }

  // À emporter : remise au comptoir avec le code de retrait que le client a reçu dans le message « prête »
  if (mode === 'counter' && o.status === 'PRETE') {
    const digits = code.replace(/\D/g, '');
    const left = o.maxCodeAttempts - o.codeAttempts;
    return (
      <form className="st-action confirm" onSubmit={async (e) => { e.preventDefault(); if (await go(() => staffApi.setStatus(o.reference, { from: o.status, to: 'LIVREE', code: digits }))) setCode(''); }}>
        <label htmlFor="st-pickup-code"><b>Le client est au comptoir : tapez le code qu’il vous donne</b></label>
        <input
          id="st-pickup-code" className="st-code-input" type="text" inputMode="numeric" autoComplete="off" maxLength={4} placeholder="• • • •"
          value={digits} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 4))} autoFocus
        />
        <p className="st-muted">Code à 4 chiffres reçu sur WhatsApp, dans le message « commande prête ».{o.codeAttempts > 0 && <> Encore <b>{left}</b> essai{left > 1 ? 's' : ''}.</>}</p>
        {steps.error && <p className="st-err">{steps.error}</p>}
        {fromHint}
        <div className="st-action-row">
          <button type="submit" className="btn btn-p" disabled={steps.busy || digits.length !== 4}>{steps.busy ? 'Vérification…' : 'Valider la remise : remercier le client'}</button>
          <button type="button" className="st-text-btn" onClick={() => setMode(null)}>Retour</button>
        </div>
        <button type="button" className="st-text-btn" onClick={() => { setReason(''); setMode('counterNoCode'); }}>Le client n’a plus son code</button>
      </form>
    );
  }

  // À emporter, client sans son code (ou 5 codes faux) : l'agent valide avec un motif
  if (mode === 'counterNoCode' && o.status === 'PRETE') {
    return (
      <form className="st-action cancel" onSubmit={async (e) => { e.preventDefault(); if (await go(() => staffApi.setStatus(o.reference, { from: o.status, to: 'LIVREE', reason }))) setReason(''); }}>
        <label htmlFor="st-counter-reason"><b>Pourquoi remettre la commande sans le code ?</b></label>
        <textarea id="st-counter-reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} placeholder="Ex. : client a effacé le message, pièce d’identité vérifiée…" autoFocus />
        <p>Vérifiez bien que c’est le client : <strong>{o.customerName}</strong>, {formatPhone(o.customerPhone)}, commande <strong>{o.reference}</strong>.</p>
        <p className="st-muted">Le motif est noté dans l’historique.</p>
        {steps.error && <p className="st-err">{steps.error}</p>}
        {fromHint}
        <div className="st-action-row">
          <button type="submit" className="btn btn-p" disabled={steps.busy || reason.trim().length < 3}>{steps.busy ? 'Enregistrement…' : 'Valider la remise sans code et remercier le client'}</button>
          <button type="button" className="st-text-btn" onClick={() => setMode(o.codeLocked ? null : 'counter')}>Retour</button>
        </div>
      </form>
    );
  }

  if (mode === 'cancel') {
    return (
      <form className="st-action cancel" onSubmit={async (e) => { e.preventDefault(); if (await go(() => staffApi.setStatus(o.reference, { from: o.status, to: 'ANNULEE', reason }))) setReason(''); }}>
        <label htmlFor="st-reason"><b>Motif de l'annulation</b></label>
        <textarea id="st-reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} placeholder="Ex. : paiement non reçu, client injoignable…" autoFocus />
        <p className="st-muted">Le motif est repris dans le message au client.</p>
        {steps.error && <p className="st-err">{steps.error}</p>}
        {fromHint}
        <div className="st-action-row">
          <button type="submit" className="btn st-btn-danger" disabled={steps.busy || reason.trim().length < 3}>{steps.busy ? 'Annulation…' : 'Annuler et prévenir le client'}</button>
          <button type="button" className="st-text-btn" onClick={() => setMode(null)}>Retour</button>
        </div>
      </form>
    );
  }

  const onNext = () => {
    if (o.status === 'PAIEMENT_A_VERIFIER') {
      setFee(o.deliveryFee != null ? String(o.deliveryFee) : '');
      setFeeReason('');
      setNight(nightInput(o.deliveryNightFee));
      setMode('confirm');
    } else if (o.status === 'EN_PREPARATION' && !pickup) {
      setCourierId('');
      setMode('depart');
    } else if (o.status === 'PRETE') {
      setCode('');
      setReason('');
      setMode(o.codeLocked || !o.deliveryCode ? 'counterNoCode' : 'counter');
    } else go(() => staffApi.setStatus(o.reference, { from: o.status, to: next.to }));
  };

  return (
    <div className="st-action">
      {blocked && <p className="st-verify-hint">{blocked}</p>}
      {o.status === 'PAIEMENT_A_VERIFIER' && (
        <p className="st-verify-hint">
          Vérifiez sur le téléphone marchand l'arrivée de <b>{formatPrice(o.itemsTotal)}</b> par {METHOD_LABEL[o.paymentMethod]}
          {o.paymentPayerPhone && <> depuis le <b>{formatPhone(o.paymentPayerPhone)}</b></>}.
        </p>
      )}
      {o.status === 'PRETE' && (
        <p className="st-wait">
          À emporter : le client vient la retirer au restaurant et donne son <b>code de retrait</b> au comptoir.
          {o.codeLocked && <> <b>Trop de codes faux</b> : si c’est bien le client, validez sans code, avec un motif.</>}
        </p>
      )}
      {o.status === 'EN_LIVRAISON' && (
        <p className="st-wait">
          Le livreur valide la livraison avec le <b>code du client</b>.
          {o.codeLocked && <> <b>Trop de codes faux</b> : si la commande a bien été remise, validez-la ci-dessous.</>}
        </p>
      )}
      {steps.error && !mode && <p className="st-err">{steps.error}</p>}
      {fromHint}
      <div className="st-action-row">
        {o.status === 'EN_LIVRAISON' ? (
          <button type="button" className="btn btn-s" disabled={steps.busy || Boolean(blocked)} onClick={() => { setReason(''); setFeeMethod(''); setMode('handover'); }}>
            Le client n’a plus son code : valider la livraison
          </button>
        ) : (
          <button type="button" className="btn btn-p st-next" disabled={steps.busy || Boolean(blocked) || (!loaded && o.status === 'PAIEMENT_A_VERIFIER')} onClick={onNext}>
            {steps.busy ? 'Enregistrement…' : !loaded && o.status === 'PAIEMENT_A_VERIFIER' ? 'Chargement…' : next.label}
          </button>
        )}
        <button type="button" className="st-text-btn danger" onClick={() => setMode('cancel')}>Annuler la commande</button>
      </div>
      <p className="st-muted st-since">Statut actuel depuis {formatTime(o.history.at(-1)?.at || o.createdAt)}</p>
    </div>
  );
}

// Frais de livraison : calculés par la grille du Patron à la commande, ou saisis en confirmant le paiement.
// Corrigeables avec un motif : par toute l'équipe jusqu'au départ du livreur, par le Patron seulement ensuite
// (le client reçoit alors le nouveau montant). Payés au livreur à la réception : une fois la commande
// livrée, on voit comment, et l'agent coche le mobile money après vérification sur le téléphone marchand.
export function DeliveryFee({ order: o, steps }) {
  const { user } = useStaff();
  const editable = o.deliveryFee != null && canEditFee(o, user.role);
  const patronOnly = o.feeEdit === 'PATRON';
  const method = o.deliveryFeeMethod;
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState('');
  const [reason, setReason] = useState('');
  const [night, setNight] = useState('');

  useEffect(() => {
    setEditing(false);
  }, [o.deliveryFee, o.deliveryNightFee, o.status]);

  const save = async (e) => {
    e.preventDefault();
    if (await steps.run(() => staffApi.setDeliveryFee(o.reference, toAmount(value), reason.trim(), toNight(night)))) setEditing(false);
  };
  const newAmount = toAmount(value);
  const newNight = toNight(night);
  const same = newAmount === o.deliveryFee && (newNight || null) === (o.deliveryNightFee || null);
  const paid = o.status === 'LIVREE' && method;
  const ok = paid && (method === 'ESPECES' ? o.cashRemitted : Boolean(o.deliveryFeeVerifiedAt));

  return (
    <section className={`st-box of-fee${ok ? ' ok' : ''}`}>
      <h2>Frais de livraison</h2>
      {editing ? (
        <form className="of-fee-form" onSubmit={save}>
          <label htmlFor="of-fee" className="st-muted">Nouveau montant (le client reçoit un nouveau message)</label>
          <span className="of-amount">
            <input id="of-fee" type="text" inputMode="numeric" autoComplete="off" value={value} onChange={(e) => setValue(e.target.value.replace(/[^\d\s]/g, ''))} autoFocus />
            <span>F</span>
          </span>
          <NightFeeField order={o} id="of-fee-night" value={night} onChange={setNight} amount={newAmount} />
          <label htmlFor="of-fee-reason" className="st-muted">Motif de la correction (noté dans l’historique)</label>
          <textarea id="of-fee-reason" className="of-fee-reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} placeholder="Ex. : client plus loin que le quartier choisi…" />
          {patronOnly && <p className="st-note">Le livreur est déjà parti : prévenez-le aussi du nouveau montant.</p>}
          {steps.error && <p className="st-err">{steps.error}</p>}
          <div className="of-fee-row">
            <button type="submit" className="btn btn-p" disabled={steps.busy || !(newAmount >= 1) || same || !nightOk(newNight, newAmount) || reason.trim().length < 3}>Corriger et prévenir</button>
            <button type="button" className="st-text-btn" onClick={() => setEditing(false)}>Annuler</button>
          </div>
        </form>
      ) : (
        <p className="of-fee-value">
          {o.deliveryFee == null
            ? <span className="st-muted">{o.deliveryFeeSource === 'A_CONFIRMER' ? 'À confirmer avec le client au téléphone, puis à saisir en confirmant le paiement.' : 'À saisir en confirmant le paiement.'}</span>
            : <b className={o.deliveryFee === 0 ? 'of-free' : undefined}>{feeText(o.deliveryFee)}{o.deliveryNightFee > 0 && <small className="of-night-v">{nightLine(o.deliveryNightFee)}</small>}</b>}
          {editable && (
            <button type="button" className="st-text-btn" onClick={() => { setValue(String(o.deliveryFee)); setReason(''); setNight(nightInput(o.deliveryNightFee)); setEditing(true); }}>Corriger</button>
          )}
        </p>
      )}
      {!editing && feeOrigin(o) && <p className="st-muted of-origin">{feeOrigin(o)}</p>}
      {!editing && patronOnly && user.role !== 'PATRON' && o.deliveryFee != null && (
        <p className="st-muted of-origin">Le livreur est parti : seul le Patron peut encore corriger les frais.</p>
      )}

      {o.deliveryFee != null && !paid && o.status !== 'ANNULEE' && (
        <p className="st-note">
          {o.feeAlreadyPaid
            ? 'Déjà payés avant le départ du livreur (ancien fonctionnement) : rien à encaisser.'
            : o.deliveryFee === 0
              ? 'Livraison offerte : le livreur n’encaisse rien.'
              : 'À payer au livreur à la réception, en espèces ou par mobile money avec le code marchand.'}
        </p>
      )}

      {paid && method === 'ESPECES' && (
        <p className={`of-paid${o.cashRemitted ? ' done' : ''}`}>
          <b>Payés en espèces au livreur</b>
          <small>{o.cashRemitted ? 'Espèces remises au restaurant.' : `Encore chez ${o.courier?.name || 'le livreur'} : à remettre (page Caisse).`}</small>
        </p>
      )}
      {paid && method === 'MOBILE_MONEY' && (
        <label className="of-check">
          <input
            type="checkbox"
            checked={Boolean(o.deliveryFeeVerifiedAt)}
            disabled={steps.busy}
            onChange={(e) => steps.run(() => staffApi.setFeeVerified(o.reference, e.target.checked), { whatsapp: false })}
          />
          <span>
            <b>Payés par mobile money : vérifiés sur le téléphone marchand</b>
            <small>
              {o.deliveryFeeVerifiedAt
                ? `Vérifiés à ${formatTime(o.deliveryFeeVerifiedAt)}`
                : `À cocher quand ${formatPrice(o.deliveryFee)} sont bien arrivés sur le téléphone marchand.`}
            </small>
          </span>
        </label>
      )}
    </section>
  );
}

// Comment le client a payé les frais au livreur : espèces ou mobile money (obligatoire à la remise)
export function FeeMethodPicker({ fee, value, onChange, big = false }) {
  return (
    <fieldset className={`fm-pick${big ? ' big' : ''}`}>
      <legend>Frais de livraison{fee != null && <> : <b>{formatPrice(fee)}</b></>}. Comment le client a-t-il payé ?</legend>
      {FEE_METHODS.map((m) => (
        <label key={m.id} className={`fm-opt${value === m.id ? ' on' : ''}`}>
          <input type="radio" name="frais" value={m.id} checked={value === m.id} onChange={() => onChange(m.id)} />
          <span>
            <b>{m.label}</b>
            <small>{m.hint}</small>
          </span>
        </label>
      ))}
    </fieldset>
  );
}

// Liste des livreurs actifs, avec leurs courses en cours
function CourierPicker({ value, onChange, exclude }) {
  const [couriers, setCouriers] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    staffApi.couriers().then(setCouriers, (e) => setError(e.message));
  }, []);

  if (error) return <p className="st-err">{error}</p>;
  if (!couriers) return <p className="st-muted">Chargement des livreurs…</p>;
  const list = couriers.filter((c) => c.id !== exclude);
  if (list.length === 0) {
    return <p className="st-verify-hint">Aucun autre compte livreur actif. Le Patron les crée sur la page Équipe.</p>;
  }
  return (
    <div className="cr-pick" role="radiogroup" aria-label="Livreur">
      {list.map((c) => (
        <label key={c.id} className="cr-opt">
          <input type="radio" name="livreur" value={c.id} checked={value === c.id} onChange={() => onChange(c.id)} />
          <span>
            <b>{c.name}</b>
            <small>{formatPhone(c.phone)} · {c.activeCourses ? `${c.activeCourses} course${c.activeCourses > 1 ? 's' : ''} en cours` : 'disponible'}</small>
          </span>
        </label>
      ))}
    </div>
  );
}

// Livreur et code de remise (détail d'une commande) : remplacement pendant la livraison
export function CourierBox({ order: o, onChange }) {
  const [editing, setEditing] = useState(false);
  const [courierId, setCourierId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setEditing(false);
  }, [o.status, o.courier?.id]);

  if (!o.courier) return null;

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      onChange(await staffApi.reassignCourier(o.reference, courierId));
    } catch (err) {
      setError(err.message);
    }
    setBusy(false);
  };

  return (
    <section className="st-box">
      <h2>Livreur</h2>
      <p className="cr-name">{o.courier.name}</p>
      <p className="st-muted">Course confiée à {formatTime(o.courier.assignedAt)}</p>
      {o.deliveryCode && o.status === 'EN_LIVRAISON' && (
        <div className={`cr-code${o.codeLocked ? ' locked' : ''}`}>
          <span>Code du client</span>
          <b>{o.deliveryCode}</b>
          <small className="st-muted">
            {o.codeLocked ? 'Bloqué : trop de codes faux' : o.codeAttempts > 0 ? `${o.codeAttempts} code${o.codeAttempts > 1 ? 's' : ''} faux` : 'Pour le client, jamais pour le livreur'}
          </small>
        </div>
      )}
      {o.status === 'EN_LIVRAISON' && (editing ? (
        <form onSubmit={save}>
          <CourierPicker value={courierId} onChange={setCourierId} exclude={o.courier.id} />
          {error && <p className="st-err">{error}</p>}
          <div className="cr-actions">
            <button type="submit" className="btn btn-p" disabled={busy || !courierId}>{busy ? 'Enregistrement…' : 'Confier à ce livreur'}</button>
            <button type="button" className="st-text-btn" onClick={() => setEditing(false)}>Annuler</button>
          </div>
        </form>
      ) : (
        <div className="cr-actions">
          <button type="button" className="st-text-btn" onClick={() => { setCourierId(''); setEditing(true); }}>Changer de livreur</button>
        </div>
      ))}
    </section>
  );
}
