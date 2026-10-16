import { formatPrice, plural } from '../../utils/format.js';
import { dayLong, minutes } from '../statement/StatementView.jsx';

// Lot 6 : ventes de Belchicken sur une période (page /equipe/ventes et version à imprimer en PDF).
// Chiffre d'affaires = total des plats des commandes payées. Annulées et paiements à vérifier à part,
// frais de livraison du restaurant à part (hors ventes), frais de notre partenaire jamais ici.
// Jamais le nom ni le téléphone du client.

const UTC = { timeZone: 'UTC' };
const when = (iso) => (iso ? new Date(iso).toLocaleString('fr-FR', { ...UTC, day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');
const money = (n) => formatPrice(n || 0);
const ROLE = { PATRON: 'Patron', PRESTATAIRE: 'Prestataire', OPERATEUR: 'Opérateur' };

export function periodText(p) {
  return p.du === p.au ? `Le ${dayLong(p.du)}` : `Du ${dayLong(p.du)} au ${dayLong(p.au)}`;
}

// Modes de paiement en une seule cellule, une ligne par mode utilisé (tableau des vérifications, déjà large)
function MethodList({ row }) {
  const used = row.payments.filter((p) => p.count);
  if (!used.length) return <td>—</td>;
  return <td className="sv-methods">{used.map((p) => <span key={p.method}>{p.label.replace(' (anciennes commandes)', '')} : <b>{money(p.amount)}</b> <small>({p.count})</small></span>)}</td>;
}

function Cancelled({ c }) {
  if (!c.count) return <td className="n">—</td>;
  return <td className="n">{c.count}<small className="rl-note">{money(c.amount)}</small></td>;
}

export default function SalesView({ s }) {
  const methods = s.payments;
  const paidTotal = s.summary.revenue;
  const share = (amount) => (paidTotal ? `${Math.round((amount / paidTotal) * 100)} %` : '—');
  const v = s.verification;

  return (
    <div className="rl sv">
      <header className="rl-head">
        <span className="rl-kicker">Ventes · Belchicken Burkina</span>
        <h2 className="rl-title">{periodText(s.period)}</h2>
        <p className="rl-sub">{plural(s.period.days, 'jour')} · une commande compte le jour où elle a été passée</p>
      </header>

      <section className="rl-tiles" aria-label="En bref">
        <Tile strong label="Chiffre d’affaires des plats" value={money(s.summary.revenue)} note="commandes payées, sans les frais de livraison" />
        <Tile label="Commandes vendues" value={s.summary.orders} note={s.summary.received ? `sur ${plural(s.summary.received, 'commande')} reçue${s.summary.received > 1 ? 's' : ''}` : 'aucune commande'} />
        <Tile label="Panier moyen" value={money(s.summary.avgBasket)} note="par commande vendue" />
        <Tile label="Commandes annulées" value={s.summary.cancelled.count} note={s.summary.cancelled.count ? `${money(s.summary.cancelled.amount)} de plats, hors chiffre d’affaires` : 'aucune'} />
        {s.summary.pending.count > 0 && (
          <Tile label="Paiement à vérifier" value={s.summary.pending.count} note={`${money(s.summary.pending.amount)}, compté une fois vérifié`} />
        )}
      </section>

      <div className="sv-two">
        <section className="rl-sec">
          <h3>Paiement des plats</h3>
          <div className="rl-scroll">
            <table className="rl-table">
              <thead><tr><th>Mode</th><th className="n">Commandes</th><th className="n">Montant</th><th className="n">Part</th></tr></thead>
              <tbody>
                {methods.map((p) => (
                  <tr key={p.method}><td>{p.label}</td><td className="n">{p.count}</td><td className="n">{money(p.amount)}</td><td className="n">{share(p.amount)}</td></tr>
                ))}
              </tbody>
              <tfoot><tr><td>Total</td><td className="n">{s.summary.orders}</td><td className="n">{money(paidTotal)}</td><td className="n">{paidTotal ? '100 %' : '—'}</td></tr></tfoot>
            </table>
          </div>
        </section>

        <section className="rl-sec">
          <h3>Livraison ou à récupérer</h3>
          <div className="rl-scroll">
            <table className="rl-table">
              <thead><tr><th>Mode</th><th className="n">Commandes</th><th className="n">Montant</th><th className="n">Part</th></tr></thead>
              <tbody>
                {s.modes.map((m) => (
                  <tr key={m.mode}><td>{m.label}</td><td className="n">{m.count}</td><td className="n">{money(m.amount)}</td><td className="n">{share(m.amount)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <section className="rl-sec">
        <h3>Par provenance</h3>
        <p className="rl-intro">« Site » : commandes passées par le client lui-même. Les autres : saisies par l’agent.</p>
        <div className="rl-scroll">
          <table className="rl-table">
            <thead>
              <tr><th>Provenance</th><th className="n">Ventes</th><th className="n">Chiffre d’affaires</th><th className="n">Panier moyen</th><th>Paiement</th><th className="n">Annulées</th></tr>
            </thead>
            <tbody>
              {s.sources.map((r) => (
                <tr key={r.key} className={r.orders || r.cancelled.count ? '' : 'muted'}>
                  <td><b>{r.name}</b>{!r.isActive && <small className="rl-note">désactivée</small>}{r.pending.count > 0 && <small className="rl-note">{r.pending.count} à vérifier</small>}</td>
                  <td className="n">{r.orders}</td>
                  <td className="n">{money(r.revenue)}</td>
                  <td className="n">{r.orders ? money(r.avgBasket) : '—'}</td>
                  <MethodList row={r} />
                  <Cancelled c={r.cancelled} />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rl-sec">
        <h3>Par agent · commandes saisies</h3>
        <p className="rl-intro">Commandes prises par l’agent au téléphone ou sur WhatsApp. Les commandes du site n’ont pas d’agent.</p>
        {s.enteredBy.length === 0 ? <p className="rl-empty">Aucune commande saisie par un agent sur la période.</p> : (
          <div className="rl-scroll">
            <table className="rl-table">
              <thead><tr><th>Agent</th><th className="n">Ventes</th><th className="n">Montant</th><th>Paiement</th><th className="n">Annulées</th><th className="n">À vérifier</th></tr></thead>
              <tbody>
                {s.enteredBy.map((r) => (
                  <tr key={r.key}>
                    <td><b>{r.name}</b>{ROLE[r.role] && r.role !== 'OPERATEUR' && <small className="rl-note">{ROLE[r.role]}</small>}</td>
                    <td className="n">{r.orders}</td>
                    <td className="n">{money(r.revenue)}</td>
                    <MethodList row={r} />
                    <Cancelled c={r.cancelled} />
                    <td className="n">{r.pending.count || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rl-sec">
        <h3>Par agent · paiements vérifiés</h3>
        <p className="rl-intro">
          Commandes dont l’agent a vérifié le paiement sur le téléphone marchand. Délai : de l’arrivée de la commande au passage à « Payée ».
          {v.count > 0 && <> Toute l’équipe : <b>{minutes(v.avgMinutes)}</b> en moyenne{v.siteCount > 0 && <> ({minutes(v.siteAvgMinutes)} pour les commandes du site{v.agentCount > 0 && <>, {minutes(v.agentAvgMinutes)} pour celles saisies par un agent</>})</>}.</>}
        </p>
        {s.verifiedBy.length === 0 ? <p className="rl-empty">Aucun paiement vérifié sur la période.</p> : (
          <div className="rl-scroll">
            <table className="rl-table">
              <thead>
                <tr>
                  <th>Agent</th><th className="n">Vérifiés</th><th className="n">Ventes</th><th className="n">Montant</th><th>Paiement</th>
                  <th className="n">Délai moyen</th><th className="n">Commandes du site</th><th className="n">Le plus long</th>
                </tr>
              </thead>
              <tbody>
                {s.verifiedBy.map((r) => (
                  <tr key={r.key}>
                    <td><b>{r.name}</b>{ROLE[r.role] && r.role !== 'OPERATEUR' && <small className="rl-note">{ROLE[r.role]}</small>}</td>
                    <td className="n">{r.verified}{r.cancelled.count > 0 && <small className="rl-note">dont {r.cancelled.count} annulée{r.cancelled.count > 1 ? 's' : ''} ensuite</small>}</td>
                    <td className="n">{r.orders}</td>
                    <td className="n">{money(r.revenue)}</td>
                    <MethodList row={r} />
                    <td className="n">{minutes(r.delay.avgMinutes)}</td>
                    <td className="n">{minutes(r.delay.siteAvgMinutes)}{r.delay.siteCount > 0 && <small className="rl-note">{plural(r.delay.siteCount, 'commande')}</small>}</td>
                    <td className="n">{minutes(r.delay.maxMinutes)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rl-sec">
        <h3>Hors ventes : frais de livraison du restaurant</h3>
        <p className="rl-intro">Payés par les clients aux livreurs du restaurant, à la réception. Ils ne comptent pas dans le chiffre d’affaires. Les frais de notre partenaire de livraison n’apparaissent jamais ici.</p>
        <div className="rl-scroll">
          <table className="rl-table">
            <thead><tr><th>Mode</th><th className="n">Livraisons</th><th className="n">Montant</th></tr></thead>
            <tbody>
              <tr><td>Espèces</td><td className="n">{s.restaurantFees.cash.count}</td><td className="n">{money(s.restaurantFees.cash.amount)}</td></tr>
              <tr><td>Mobile money</td><td className="n">{s.restaurantFees.mobile.count}</td><td className="n">{money(s.restaurantFees.mobile.amount)}</td></tr>
            </tbody>
            <tfoot><tr><td>Total</td><td className="n">{s.restaurantFees.count}</td><td className="n">{money(s.restaurantFees.amount)}</td></tr></tfoot>
          </table>
        </div>
      </section>

      <section className="rl-sec">
        <h3>Commandes annulées</h3>
        <p className="rl-intro">Jamais dans le chiffre d’affaires.</p>
        {s.cancellations.length === 0 ? <p className="rl-empty">Aucune commande annulée sur la période.</p> : (
          <div className="rl-scroll">
            <table className="rl-table">
              <thead><tr><th>Commande</th><th>Annulée</th><th>Motif</th><th>Provenance</th><th className="n">Plats</th></tr></thead>
              <tbody>
                {s.cancellations.map((c) => (
                  <tr key={c.reference}>
                    <td><b>{c.reference}</b><small className="rl-note">passée le {when(c.createdAt)}</small></td>
                    <td>{when(c.cancelledAt)}{c.stage && <small className="rl-note">à l’étape « {c.stage} »{c.by ? `, par ${c.by}` : ''}</small>}</td>
                    <td>{c.reason || '—'}</td>
                    <td>{c.source}{c.enteredBy && <small className="rl-note">saisie par {c.enteredBy}</small>}</td>
                    <td className="n">{money(c.amount)}<small className="rl-note">{c.paymentMethod}{c.paymentWasVerified ? ', payée' : ''}</small></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <p className="rl-foot">
        Préparé le {when(s.generatedAt)} (heure du Burkina). Ventes = commandes dont le paiement a été vérifié, annulées non comprises ;
        chiffre d’affaires = total des plats, sans les frais de livraison.
      </p>
    </div>
  );
}

function Tile({ label, value, note, strong }) {
  return (
    <div className={`rl-tile${strong ? ' strong' : ''}`}>
      <span className="rl-tile-label">{label}</span>
      <b className="rl-tile-value">{value}</b>
      {note && <small>{note}</small>}
    </div>
  );
}
