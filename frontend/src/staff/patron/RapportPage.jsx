import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { staffApi } from '../../api/client.js';
import { formatPrice, plural } from '../../utils/format.js';
import { changeText, changeTone, hourWindow, monthRange, previousMonth } from './patron-simple.js';
import './patron.css';

// Compte Patron simplifié, lot B : rapport du mois aux couleurs Belchicken, à imprimer ou à enregistrer en PDF
// (« Imprimer », puis « Enregistrer au format PDF »). Page seule, A4, mêmes chiffres que la page Comptes (période
// « deux dates » du 1er au dernier jour du mois). Jamais de nom ni de numéro de client.
const fMonth = new Intl.DateTimeFormat('fr-FR', { timeZone: 'UTC', month: 'long', year: 'numeric' });
const fNow = new Intl.DateTimeFormat('fr-FR', { timeZone: 'UTC', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const today = () => new Date().toISOString().slice(0, 10);
const SHORT_DAYS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

// Barres fixes (pas de survol à l'impression) : la valeur la plus haute est écrite au-dessus de sa barre
function PrintBars({ bars }) {
  const max = Math.max(1, ...bars.map((b) => b.value));
  const best = bars.reduce((b, x, i) => (x.value > bars[b].value ? i : b), 0);
  return (
    <div className="rp-bars" style={{ gridTemplateColumns: `repeat(${bars.length}, minmax(0, 1fr))` }}>
      {bars.map((b, i) => (
        <div key={b.key} className={i === best ? 'best' : undefined}>
          <span className="rp-bar-v">{i === best && b.value ? formatPrice(b.value) : ''}</span>
          <span className="rp-bar" style={{ height: `${(b.value / max) * 100}%` }} />
          <span className="rp-bar-l">{b.label}</span>
        </div>
      ))}
    </div>
  );
}

export default function RapportPage() {
  const [params] = useSearchParams();
  const now = today();
  const mois = params.get('mois') || previousMonth(now.slice(0, 7));
  const range = monthRange(mois, now);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const title = range ? `Rapport de ${fMonth.format(new Date(`${mois}-01T00:00:00Z`))}` : 'Rapport du mois';

  useEffect(() => {
    if (!range) return;
    setData(null);
    staffApi.accounts({ periode: 'dates', du: range.du, au: range.au }).then(setData, setError);
  }, [mois]); // eslint-disable-line react-hooks/exhaustive-deps

  // A4, couleurs gardées à l'impression, nom du fichier PDF proposé par le navigateur (titre de la page)
  useEffect(() => {
    const style = document.createElement('style');
    style.textContent = '@page{size:A4;margin:10mm}';
    document.head.appendChild(style);
    const old = document.title;
    document.title = `Belchicken · ${title}`;
    return () => {
      style.remove();
      document.title = old;
    };
  }, [title]);

  const s = data?.summary;
  return (
    <div className="slip-page rp-page">
      <div className="slip-bar rp-bar-top">
        <Link className="st-back" to="/equipe/comptes">‹ Comptes</Link>
        <Link className="pc-linkbtn" to={`/equipe/comptes/rapport?mois=${previousMonth(mois)}`}>‹ Mois d’avant</Link>
        <button type="button" className="btn btn-p" onClick={() => window.print()} disabled={!data}>Imprimer · PDF</button>
      </div>
      <p className="rl-print-help rp-help">Pour un PDF : « Imprimer », puis choisissez « Enregistrer au format PDF » comme imprimante.</p>
      {!range && <div className="alert err" role="alert"><span>Ce mois n’existe pas ou n’a pas encore commencé.</span></div>}
      {error && <div className="alert err" role="alert"><span>{error.message}</span></div>}
      {range && !data && !error && <p className="st-muted">Préparation du rapport…</p>}
      {data && (
        <article className="rp-sheet">
          <header className="rp-head">
            <img src="/brand/logo-belchicken-560.webp" alt="Belchicken" />
            <div>
              <h1>{title}</h1>
              <p>Belchicken Burkina · Kamsonghin, Ouagadougou{range.complete ? '' : ` · jusqu’au ${range.au.split('-').reverse().join('/')}`}</p>
            </div>
          </header>

          <section className="rp-hero">
            <h2>Ventes des repas</h2>
            <p className="rp-big">{formatPrice(s.revenue)}</p>
            {data.comparable && data.changes.revenue != null && (
              <p><span className={`pc-chg ${changeTone(data.changes.revenue)}`}>{changeText(data.changes.revenue)}</span> par rapport {data.period.compared} ({formatPrice(data.previous.revenue)})</p>
            )}
          </section>

          <div className="rp-tiles">
            <div><h3>Commandes payées</h3><p>{s.paid}</p></div>
            <div><h3>Panier moyen</h3><p>{s.paid ? formatPrice(s.avgBasket) : '—'}</p></div>
            <div><h3>Livraison</h3><p>{s.delivery.count}</p><small>{formatPrice(s.delivery.revenue)}</small></div>
            <div><h3>À récupérer</h3><p>{s.pickup.count}</p><small>{formatPrice(s.pickup.revenue)}</small></div>
            <div><h3>Annulations</h3><p>{s.cancelled.count}</p><small>{s.cancelled.afterPayment.count} après paiement</small></div>
            <div><h3>Note des avis</h3><p>{data.reviews.count ? `${String(data.reviews.average).replace('.', ',')}/5` : '—'}</p><small>{`${data.reviews.count} avis`}</small></div>
          </div>

          {data.insights.length > 0 && (
            <ul className="rp-insights">{data.insights.map((i) => <li key={i.key} className={i.tone}>{i.text}</li>)}</ul>
          )}

          {s.paid > 0 && (
            <div className="rp-two">
              <section>
                <h2>Ventes par heure</h2>
                <PrintBars bars={hourWindow(data.hours).map((h) => ({ key: h.hour, label: h.hour % 2 ? '' : `${h.hour}h`, value: h.revenue }))} />
              </section>
              <section>
                <h2>Ventes moyennes par jour</h2>
                <PrintBars bars={data.days.map((d) => ({ key: d.day, label: SHORT_DAYS[d.day], value: d.avgRevenue }))} />
              </section>
            </div>
          )}

          <div className="rp-two">
            <section>
              <h2>Plats les plus vendus</h2>
              {data.top.length ? (
                <ol className="rp-list">{data.top.map((p) => <li key={p.name}><b>{p.name}</b><span>{p.quantity} vendus · {formatPrice(p.revenue)}</span></li>)}</ol>
              ) : <p className="pc-none">Aucun plat vendu.</p>}
            </section>
            <section>
              <h2>Vos clients</h2>
              {data.clients.customers ? (
                <ol className="rp-list">
                  <li><b>{data.clients.customers} clients</b><span>{data.clients.newCustomers} nouveaux · {data.clients.returning} revenus</span></li>
                  <li><b>{data.clients.loyalShare} %</b><span>des commandes viennent d’habitués</span></li>
                  {data.clients.top.slice(0, 3).map((t) => <li key={t.rank}><b>Client n° {t.rank}</b><span>{plural(t.orders, 'commande')} · {formatPrice(t.revenue)}</span></li>)}
                  <li><b>{data.zones.total}</b><span>livraisons ({data.zones.zones.length} zone{data.zones.zones.length > 1 ? 's' : ''} sur la carte de l’application)</span></li>
                </ol>
              ) : <p className="pc-none">Aucun client sur ce mois.</p>}
            </section>
          </div>

          <div className="rp-foot">
            Ventes des repas seulement, sans les frais de livraison ; commandes comptées le jour où elles ont été passées.
            {data.since && ` Comptes depuis le ${data.since.split('-').reverse().join('/')}.`} Préparé le {fNow.format(new Date(data.generatedAt))}.
          </div>
        </article>
      )}
    </div>
  );
}
