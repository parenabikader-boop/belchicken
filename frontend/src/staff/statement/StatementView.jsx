import { formatPrice, plural } from '../../utils/format.js';

// Lot 5d : relevé de notre équipe de livraison, lisible par quelqu'un qui n'est pas informaticien (il sert aussi
// à la présentation à Belchicken). Partagé par la page (/equipe/releve) et la version à imprimer en PDF.
// Les conditions du contrat et le montant dû ne sont affichés que s'ils sont dans le relevé : le serveur ne les
// envoie jamais au Responsable livraison.

const UTC = { timeZone: 'UTC' };
// « 1er octobre 2026 », « 10 octobre 2026 »
export const dayLong = (key) => {
  const d = new Date(`${key}T00:00:00Z`);
  const text = d.toLocaleDateString('fr-FR', { ...UTC, day: 'numeric', month: 'long', year: 'numeric' });
  return d.getUTCDate() === 1 ? text.replace(/^1 /, '1er ') : text;
};
const dayShort = (iso) => new Date(iso).toLocaleDateString('fr-FR', { ...UTC, day: 'numeric', month: 'short' });
const time = (iso) => new Date(iso).toLocaleTimeString('fr-FR', { ...UTC, hour: '2-digit', minute: '2-digit' });
const when = (iso) => (iso ? `${dayShort(iso)}, ${time(iso)}` : '—');
export const minutes = (m) => {
  if (m == null) return '—';
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}`;
};
const money = (n) => formatPrice(n || 0);

export default function StatementView({ s }) {
  const withContract = Boolean(s.amountDue);
  const company = s.company.name || 'notre équipe de livraison';
  const total = s.delays.find((d) => d.key === 'total');

  return (
    <div className="rl">
      <header className="rl-head">
        <span className="rl-kicker">Relevé de livraison</span>
        <h2 className="rl-title">Du {dayLong(s.period.du)} au {dayLong(s.period.au)}</h2>
        <p className="rl-sub">Livraisons faites par <b>{company}</b> pour <b>{s.company.client}</b> · {plural(s.period.days, 'jour')}</p>
      </header>

      <section className="rl-tiles" aria-label="En bref">
        <Tile label="Livraisons faites" value={s.summary.deliveries} note={s.summary.offered ? `dont ${s.summary.offered} offerte${s.summary.offered > 1 ? 's' : ''} (rien payé au livreur)` : 'aucune livraison offerte'} />
        <Tile label="Frais encaissés" value={money(s.summary.feesTotal)} note={`${money(s.summary.cash)} en espèces · ${money(s.summary.mobile)} par mobile money`} />
        <Tile label="Du paiement à la livraison" value={minutes(total?.minutes)} note="en moyenne" />
        <Tile label="Commandes annulées" value={s.summary.cancellations} note={s.summary.cancellations ? 'détail plus bas' : 'aucune'} />
        {withContract && (
          <Tile
            strong
            label={`Montant dû par ${s.company.client}`}
            value={money(s.amountDue.total)}
            note={s.amountDue.incomplete ? 'des jours sans conditions : voir plus bas' : 'selon les conditions du contrat'}
          />
        )}
      </section>

      {withContract && <AmountDue s={s} />}

      <section className="rl-sec">
        <h3>Frais de livraison encaissés</h3>
        <p className="rl-intro">Payés par les clients à nos livreurs, à la réception. Ce sont seulement les frais de livraison : aucun montant des plats.</p>
        <div className="rl-scroll">
        <table className="rl-table">
          <thead><tr><th>Mode</th><th className="n">Livraisons</th><th className="n">Montant</th><th>Où en est l’argent</th></tr></thead>
          <tbody>
            <tr>
              <td>Espèces</td><td className="n">{s.fees.cash.count}</td><td className="n">{money(s.fees.cash.amount)}</td>
              <td>{money(s.fees.cash.remitted)} remis · {money(s.fees.cash.held)} encore chez les livreurs</td>
            </tr>
            <tr>
              <td>Mobile money</td><td className="n">{s.fees.mobile.count}</td><td className="n">{money(s.fees.mobile.amount)}</td>
              <td>{money(s.fees.mobile.verified)} vérifiés · {money(s.fees.mobile.toVerify)} à vérifier</td>
            </tr>
            <tr>
              <td>Livraisons offertes</td><td className="n">{s.fees.offeredCount}</td><td className="n">0 F</td>
              <td>Le client n’a rien payé au livreur.</td>
            </tr>
            {s.fees.unknown.count > 0 && (
              <tr><td>Mode non précisé</td><td className="n">{s.fees.unknown.count}</td><td className="n">{money(s.fees.unknown.amount)}</td><td>—</td></tr>
            )}
          </tbody>
          <tfoot>
            <tr><td>Total</td><td className="n">{s.summary.deliveries}</td><td className="n">{money(s.fees.total)}</td><td>{s.fees.nightTotal > 0 ? `dont ${money(s.fees.nightTotal)} de supplément de nuit` : ''}</td></tr>
          </tfoot>
        </table>
        </div>
      </section>

      <Delays delays={s.delays} />

      <section className="rl-sec">
        <h3>Par livreur</h3>
        {s.couriers.length === 0 ? <p className="rl-empty">Aucune livraison sur la période.</p> : (
          <div className="rl-scroll">
            <table className="rl-table">
              <thead>
                <tr>
                  <th>Livreur</th><th className="n">Livraisons</th><th className="n">Espèces</th><th className="n">Encore sur lui</th>
                  <th className="n">Mobile money</th><th className="n">Attente moyenne</th><th className="n">Trajet moyen</th><th className="n">Tournées</th>
                </tr>
              </thead>
              <tbody>
                {s.couriers.map((c) => (
                  <tr key={c.courierId || c.name}>
                    <td>
                      <b>{c.name}</b>
                      {c.pickedUpWithoutCourier > 0 && <small className="rl-note">{plural(c.pickedUpWithoutCourier, 'récupération')} confirmée{c.pickedUpWithoutCourier > 1 ? 's' : ''} à sa place</small>}
                    </td>
                    <td className="n">{c.deliveries}{c.offered > 0 && <small className="rl-note">dont {c.offered} offerte{c.offered > 1 ? 's' : ''}</small>}</td>
                    <td className="n">{money(c.cash)}</td>
                    <td className="n">{money(c.cashHeld)}</td>
                    <td className="n">{money(c.mobile)}</td>
                    <td className="n">{minutes(c.waitMinutes)}</td>
                    <td className="n">{minutes(c.rideMinutes)}</td>
                    <td className="n">{c.runs}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rl-sec">
        <h3>Par tournée</h3>
        <p className="rl-intro">Une tournée = plusieurs commandes confiées en une fois au même livreur. Durée : de la première commande récupérée à la dernière livrée.</p>
        {s.tours.length === 0 ? <p className="rl-empty">Aucune tournée sur la période.</p> : (
          <div className="rl-scroll">
            <table className="rl-table">
              <thead><tr><th>Confiée le</th><th>Livreur</th><th className="n">Commandes</th><th className="n">Livrées</th><th className="n">Annulées</th><th className="n">Durée</th></tr></thead>
              <tbody>
                {s.tours.map((t) => (
                  <tr key={t.id}>
                    <td>{when(t.createdAt)}</td><td>{t.courierName}</td><td className="n">{t.orders}</td>
                    <td className="n">{t.delivered}</td><td className="n">{t.cancelled}</td><td className="n">{minutes(t.durationMinutes)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rl-sec">
        <h3>Annulations</h3>
        {s.cancellations.length === 0 ? <p className="rl-empty">Aucune commande annulée sur la période.</p> : (
          <div className="rl-scroll">
            <table className="rl-table">
              <thead><tr><th>Commande</th><th>Annulée le</th><th>À quelle étape</th><th>Motif</th></tr></thead>
              <tbody>
                {s.cancellations.map((c) => (
                  <tr key={c.reference}>
                    <td><b>{c.reference}</b>{c.zone && <small className="rl-note">{c.zone}</small>}</td>
                    <td>{when(c.cancelledAt)}</td>
                    <td>{c.stageLabel}{c.courierName && <small className="rl-note">Livreur : {c.courierName}</small>}</td>
                    <td>{c.reason || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rl-sec rl-detail">
        <h3>Détail des livraisons</h3>
        {s.deliveries.length === 0 ? <p className="rl-empty">Aucune livraison sur la période.</p> : (
          <div className="rl-scroll">
            <table className="rl-table rl-small">
              <thead>
                <tr><th>Commande</th><th>Livrée le</th><th>Quartier</th><th>Livreur</th><th className="n">Frais</th><th>Payés</th><th className="n">Préparation</th><th className="n">Attente</th><th className="n">Trajet</th></tr>
              </thead>
              <tbody>
                {s.deliveries.map((d) => (
                  <tr key={d.reference}>
                    <td><b>{d.reference}</b></td>
                    <td>{when(d.deliveredAt)}</td>
                    <td>{d.zone || '—'}</td>
                    <td>{d.courierName}</td>
                    <td className="n">{d.offered ? 'Offerte' : money(d.fee)}</td>
                    <td>{d.offered ? '—' : d.method === 'ESPECES' ? 'Espèces' : d.method === 'MOBILE_MONEY' ? 'Mobile money' : '—'}</td>
                    <td className="n">{minutes(d.preparationMinutes)}</td>
                    <td className="n">{minutes(d.waitMinutes)}</td>
                    <td className="n">{minutes(d.rideMinutes)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <p className="rl-foot">
        Heures du Burkina. Relevé préparé le {dayLong(String(s.generatedAt).slice(0, 10))} à {time(s.generatedAt)}, à partir des heures enregistrées à chaque
        étape de chaque commande (elles ne peuvent pas être modifiées).
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

function AmountDue({ s }) {
  const due = s.amountDue;
  return (
    <section className="rl-sec rl-due">
      <h3>Montant dû par {s.company.client}</h3>
      <p className="rl-intro">Calculé jour par jour, avec les conditions du contrat en vigueur chaque jour.</p>
      <div className="rl-scroll">
        <table className="rl-table">
          <thead><tr><th>Ligne</th><th>Calcul</th><th className="n">Montant</th></tr></thead>
          <tbody>
            {due.lines.map((l, i) => (
              <tr key={i} className={l.kind === 'NON_REGLE' ? 'muted' : ''}>
                <td><b>{l.label}</b><small className="rl-note">{l.explain}</small></td>
                <td>{l.detail}</td>
                <td className="n">{l.amount == null ? '—' : money(l.amount)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot><tr><td colSpan={2}>Total dû</td><td className="n">{money(due.total)}</td></tr></tfoot>
        </table>
      </div>
      {due.incomplete && <p className="rl-warn">Certains jours de la période n’avaient pas encore de conditions : rien n’est calculé pour eux.</p>}
      {s.contract.versions.length > 0 && (
        <div className="rl-terms">
          <b>Conditions appliquées</b>
          <ul>
            {s.contract.versions.map((v) => (
              <li key={v.id}>À partir du {dayLong(v.validFrom)} : {v.text}{v.note && <> · <i>{v.note}</i></>}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

// Délais moyens, avec une barre qui montre où passe le temps (préparation, attente du livreur, trajet)
function Delays({ delays }) {
  const by = Object.fromEntries(delays.map((d) => [d.key, d]));
  const parts = ['preparation', 'wait', 'ride'].map((k) => by[k]).filter((d) => d?.minutes != null);
  const sum = parts.reduce((n, d) => n + d.minutes, 0);
  return (
    <section className="rl-sec">
      <h3>Délais moyens</h3>
      <p className="rl-intro">Temps moyen entre deux étapes, d’après les heures enregistrées à chaque étape.</p>
      {sum > 0 && (
        <div className="rl-bar" aria-hidden="true">
          {parts.map((d) => <span key={d.key} className={`rl-bar-${d.key}`} style={{ flexGrow: d.minutes }} title={`${d.label} : ${minutes(d.minutes)}`} />)}
        </div>
      )}
      <ul className="rl-delays">
        {delays.map((d) => (
          <li key={d.key} className={d.key === 'total' ? 'total' : ''}>
            {d.key !== 'total' && <i className={`rl-dot rl-bar-${d.key}`} aria-hidden="true" />}
            <span><b>{d.label}</b><small>{d.help} · {plural(d.count, 'commande')} comptée{d.count > 1 ? 's' : ''}</small></span>
            <b className="rl-delay-value">{minutes(d.minutes)}</b>
          </li>
        ))}
      </ul>
    </section>
  );
}
