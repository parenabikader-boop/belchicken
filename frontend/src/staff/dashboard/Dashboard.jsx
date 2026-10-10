import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { staffApi } from '../../api/client.js';
import { formatPrice, plural } from '../../utils/format.js';

// Tableau de bord du Patron (l'API le réserve au Patron). Pensé d'abord pour le téléphone :
// une colonne, chiffres clés en haut, graphiques en barres simples (toucher une barre affiche sa valeur).
// Heure du Burkina = UTC : toutes les dates sont affichées en UTC.
const TZ = 'UTC';
const REFRESH_MS = 60 * 1000;
const fmt = (opts) => new Intl.DateTimeFormat('fr-FR', { timeZone: TZ, ...opts });
const fDay = fmt({ weekday: 'long', day: 'numeric', month: 'long' });
const fShort = fmt({ day: 'numeric', month: 'short' });
const fWeekday = fmt({ weekday: 'short', day: 'numeric' });
const fMonth = fmt({ month: 'long', year: 'numeric' });
const fDateTime = fmt({ day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const DAY = 864e5;

const PERIODS = [
  { id: 'day', label: 'Jour' },
  { id: 'week', label: 'Semaine' },
  { id: 'month', label: 'Mois' },
];
const WEEKDAYS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
const WEEKDAYS_LONG = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];
const METHODS = {
  ORANGE_MONEY: { label: 'Orange Money', cls: 'om' },
  MOOV_MONEY: { label: 'Moov Money', cls: 'moov' },
  TELECEL_MONEY: { label: 'Telecel Money', cls: 'telecel' },
};

function periodTitle(r) {
  const start = new Date(r.start);
  if (r.period === 'day') return r.offset === 0 ? "Aujourd'hui" : r.offset === -1 ? 'Hier' : cap(fDay.format(start));
  if (r.period === 'week') {
    if (r.offset === 0) return 'Cette semaine';
    if (r.offset === -1) return 'Semaine dernière';
    return `Semaine du ${fShort.format(start)}`;
  }
  return cap(fMonth.format(start));
}

function periodSub(r) {
  const start = new Date(r.start);
  const last = new Date(new Date(r.end).getTime() - DAY);
  if (r.period === 'day') return r.offset > -2 ? cap(fDay.format(start)) : null;
  if (r.period === 'week') return `Du lundi ${fShort.format(start)} au dimanche ${fShort.format(last)}`;
  return r.offset === 0 ? 'Ce mois-ci' : null;
}

// Avec quoi on compare (voir backend services/dashboard.js) : [en cours, période passée], { vs, when }
const COMPARE = {
  day: [{ vs: 'par rapport à hier à la même heure', when: 'hier à la même heure' }, { vs: 'par rapport à la veille', when: 'la veille' }],
  week: [
    { vs: 'par rapport à la semaine dernière au même moment', when: 'la semaine dernière au même moment' },
    { vs: 'par rapport à la semaine précédente', when: 'la semaine précédente' },
  ],
  month: [
    { vs: 'par rapport au mois dernier au même moment', when: 'le mois dernier au même moment' },
    { vs: 'par rapport au mois précédent', when: 'le mois précédent' },
  ],
};
const compareLabel = (r) => COMPARE[r.period][r.isCurrent ? 0 : 1];

// Évolution : flèche et mot en plus de la couleur ; pour les annulations, une hausse est une mauvaise nouvelle
function Delta({ now, before, compare, upIsBad = false, money = false }) {
  if (!before) {
    return <p className="db-delta flat">{now ? `Pas de comparaison : rien ${compare.when}` : `Rien non plus ${compare.when}`}</p>;
  }
  const pct = Math.round(((now - before) / before) * 100);
  const diff = money ? formatPrice(before) : before;
  if (pct === 0) return <p className="db-delta flat">= Stable {compare.vs} <span className="db-nw">({diff})</span></p>;
  const good = pct > 0 !== upIsBad;
  return (
    <p className={`db-delta ${good ? 'good' : 'bad'}`}>
      <span aria-hidden="true">{pct > 0 ? '▲' : '▼'}</span> {pct > 0 ? '+' : '−'}{Math.abs(pct)} % <span className="db-vs">{compare.vs} <span className="db-nw">({diff})</span></span>
    </p>
  );
}

// Valeur ronde pour le haut de l'échelle : 7 300 -> 8 000, 46 -> 50
function niceMax(v) {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  return [1, 2, 2.5, 5, 10].map((k) => k * p).find((s) => s >= v);
}
const compact = (n) => (n >= 1e6 ? `${(n / 1e6).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} M` : n >= 1000 ? `${Math.round(n / 1000)} k` : String(n));

// Graphique en colonnes. bars : [{ key, label (axe), name (lecture), value, detail }]
function Columns({ bars, money = false, every = 1, emptyText }) {
  const best = bars.reduce((b, x, i) => (x.value > bars[b].value ? i : b), 0);
  const [sel, setSel] = useState(null);
  const max = niceMax(Math.max(...bars.map((b) => b.value)));
  const shown = bars[sel ?? best];
  const total = bars.reduce((s, b) => s + b.value, 0);
  if (!total) return <p className="st-muted db-none">{emptyText}</p>;
  return (
    <div className="db-cols">
      <p className="db-read" aria-live="polite">
        <b>{shown.name}</b> · {money ? formatPrice(shown.value) : shown.value}
        {shown.detail ? ` · ${shown.detail}` : ''}
        {sel == null && <span className="db-read-hint"> (le plus haut)</span>}
      </p>
      <div className="db-plot">
        <div className="db-grid" aria-hidden="true">
          <span><em>{money ? compact(max) : max}</em></span>
          <span><em>{money ? compact(max / 2) : max / 2}</em></span>
          <span><em>0</em></span>
        </div>
        <div className="db-bars" style={{ gridTemplateColumns: `repeat(${bars.length}, minmax(0, 1fr))` }}>
          {bars.map((b, i) => (
            <button
              key={b.key}
              type="button"
              className={`db-bar${i === (sel ?? best) ? ' on' : ''}`}
              onClick={() => setSel(i)}
              onMouseEnter={() => setSel(i)}
              aria-label={`${b.name} : ${money ? formatPrice(b.value) : b.value}`}
            >
              <span style={{ height: `${(b.value / max) * 100}%` }} />
            </button>
          ))}
        </div>
      </div>
      <div className="db-axis" style={{ gridTemplateColumns: `repeat(${bars.length}, minmax(0, 1fr))` }} aria-hidden="true">
        {bars.map((b, i) => <span key={b.key}>{i % every === 0 ? b.label : ''}</span>)}
      </div>
    </div>
  );
}

// Classement en barres horizontales ; value : ce qui fixe la longueur
function Ranking({ rows, value, right, sub }) {
  const max = Math.max(...rows.map(value), 1);
  return (
    <ol className="db-rank">
      {rows.map((r, i) => (
        <li key={r.name}>
          <div className="db-rank-top">
            <span className="db-rank-n">{i + 1}</span>
            <b>{r.name}</b>
            <span className="db-rank-v">{right(r)}</span>
          </div>
          <div className="db-track"><span style={{ width: `${(value(r) / max) * 100}%` }} /></div>
          {sub && <small>{sub(r)}</small>}
        </li>
      ))}
    </ol>
  );
}

// Heures : de 10 h à 23 h, élargi si des commandes arrivent plus tôt ou plus tard
function hourBars(values, toBar) {
  const used = values.map((v, h) => (v ? h : null)).filter((h) => h != null);
  const from = Math.min(10, ...used);
  const to = Math.max(23, ...used);
  return values.slice(from, to + 1).map((v, i) => toBar(v, from + i));
}

function timelineBars(d) {
  const p = d.range.period;
  const cutoff = new Date(d.range.cutoff);
  const list = d.timeline;
  if (p === 'day') {
    const vals = list.map((t) => t.revenue);
    return hourBars(vals, (v, h) => ({ key: h, label: `${h}h`, name: `${h} h – ${h + 1} h`, value: v, detail: plural(list[h].paid, 'commande') }));
  }
  return list.map((t) => {
    const at = new Date(t.at);
    const future = at > cutoff;
    return {
      key: t.at,
      label: p === 'week' ? WEEKDAYS[(at.getUTCDay() + 6) % 7] : String(at.getUTCDate()),
      name: cap(fWeekday.format(at)),
      value: t.revenue,
      detail: future ? 'à venir' : plural(t.paid, 'commande'),
    };
  });
}

// 26 -> « 26 min », 75 -> « 1 h 15 », vide -> « — »
const duration = (min) => (min == null ? '—' : min < 60 ? `${min} min` : `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')}`);

function Card({ title, sub, children, wide }) {
  return (
    <section className={`st-box db-card${wide ? ' wide' : ''}`}>
      <h2>{title}</h2>
      {sub && <p className="st-muted db-sub">{sub}</p>}
      {children}
    </section>
  );
}

export default function Dashboard() {
  const [period, setPeriod] = useState('day');
  const [offset, setOffset] = useState(0);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  // Chargement à chaque changement de période, puis rechargement discret toutes les 60 s
  // (onglet visible) et au retour sur l'onglet : les chiffres suivent les commandes payées ou annulées.
  useEffect(() => {
    let alive = true; // ignore une réponse arrivée après un changement de période
    const load = (quiet) => {
      if (!quiet) {
        setLoading(true);
        setError(null);
      }
      staffApi.getDashboard(period, offset).then(
        (d) => { if (alive) { setData(d); setError(null); setLoading(false); } },
        (e) => { if (alive) { if (!quiet) setError(e); setLoading(false); } },
      );
    };
    load(false);
    const timer = setInterval(() => !document.hidden && load(true), REFRESH_MS);
    const onShow = () => !document.hidden && load(true);
    document.addEventListener('visibilitychange', onShow);
    return () => {
      alive = false;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onShow);
    };
  }, [period, offset]);

  const choose = (p) => {
    setPeriod(p);
    setOffset(0);
  };

  const r = data?.range;
  const s = data?.summary;
  const prev = data?.previous;
  const compare = r && compareLabel(r);
  const paidTotal = data ? data.payments.reduce((n, p) => n + p.paid, 0) : 0;
  // Parts en % : la dernière complète à 100 pour que le total tombe juste
  const shares = data ? data.payments.map((p) => (paidTotal ? Math.round((p.paid / paidTotal) * 100) : 0)) : [];
  if (paidTotal && shares.length) shares[shares.length - 1] = 100 - shares.slice(0, -1).reduce((a, b) => a + b, 0);

  return (
    <div className="db">
      <div className="st-head">
        <h1 className="st-title">Tableau de bord</h1>
      </div>

      <div className="db-period" role="group" aria-label="Période">
        {PERIODS.map((p) => (
          <button key={p.id} type="button" className={period === p.id ? 'on' : ''} aria-pressed={period === p.id} onClick={() => choose(p.id)}>{p.label}</button>
        ))}
      </div>
      <div className="db-nav">
        <button type="button" className="db-arrow" onClick={() => setOffset((o) => o - 1)} disabled={loading || offset <= -60} aria-label="Période précédente">‹</button>
        <div className="db-nav-t">
          <b>{r ? periodTitle(r) : '…'}</b>
          {r && periodSub(r) && <small>{periodSub(r)}</small>}
        </div>
        <button type="button" className="db-arrow" onClick={() => setOffset((o) => o + 1)} disabled={loading || offset >= 0} aria-label="Période suivante">›</button>
      </div>

      {error && (
        <>
          <div className="alert err" role="alert"><span>{error.message}</span></div>
          <button type="button" className="btn btn-p" style={{ marginTop: 14 }} onClick={load}>Réessayer</button>
        </>
      )}
      {!data && !error && <p className="st-muted">Chargement des chiffres…</p>}

      {data && (
        <div className={`db-body${loading ? ' loading' : ''}`}>
          <section className="st-box db-hero">
            <h2>Chiffre d'affaires des plats</h2>
            <p className="db-big">{formatPrice(s.revenue)}</p>
            <Delta now={s.revenue} before={prev.revenue} compare={compare} money />
            <p className="st-muted db-note">Commandes payées seulement (payée, en préparation, en livraison, livrée).</p>
            <div className="db-fees">
              <h3>Frais de livraison encaissés</h3>
              <p className="db-num">{formatPrice(s.deliveryRevenue)}</p>
              <Delta now={s.deliveryRevenue} before={prev.deliveryRevenue} compare={compare} money />
              <dl className="db-feesplit">
                <dt>En espèces</dt>
                <dd><b>{formatPrice(s.deliveryCash)}</b> <small className="st-muted">{plural(s.deliveryCashCount, 'commande')}</small></dd>
                <dt>Par mobile money</dt>
                <dd><b>{formatPrice(s.deliveryMobile)}</b> <small className="st-muted">{plural(s.deliveryMobileCount, 'commande')}</small></dd>
              </dl>
              <p className="st-muted db-note">Payés au livreur à la réception, sauf commande annulée. À part du chiffre des plats.</p>
              {/* Lot 5b : frais des commandes livrées par notre partenaire, payés sur ses codes : pas des recettes du restaurant */}
              {s.partnerFeesCount > 0 && (
                <p className="st-muted db-note">
                  Livraisons par notre partenaire : {plural(s.partnerFeesCount, 'commande')}, {formatPrice(s.partnerFees)} de frais
                  payés sur ses codes, non comptés ci-dessus.
                </p>
              )}
              {data.cashWithCouriers && (
                <Link to="/equipe/caisse?onglet=livreurs" className={`db-cash${data.cashWithCouriers.amount ? ' has' : ''}`}>
                  <span>Espèces encore chez les livreurs</span>
                  <b>{formatPrice(data.cashWithCouriers.amount)}</b>
                  <small>{data.cashWithCouriers.count ? `${plural(data.cashWithCouriers.count, 'course')} · à remettre, page Caisse` : 'Tout est remis.'}</small>
                </Link>
              )}
            </div>
          </section>

          <div className="db-tiles">
            <div className="st-box db-tile">
              <h3>Commandes payées</h3>
              <p className="db-num">{s.paid}</p>
              <Delta now={s.paid} before={prev.paid} compare={compare} />
            </div>
            <div className="st-box db-tile">
              <h3>Panier moyen</h3>
              <p className="db-num">{s.paid ? formatPrice(s.avgBasket) : '—'}</p>
              <Delta now={s.avgBasket} before={prev.avgBasket} compare={compare} money />
            </div>
            <div className="st-box db-tile">
              <h3>Annulées</h3>
              <p className="db-num">{s.cancelled}</p>
              <Delta now={s.cancelled} before={prev.cancelled} compare={compare} upIsBad />
            </div>
          </div>
          <p className="st-muted db-received">
            {plural(s.received, 'commande')} {s.received > 1 ? 'reçues' : 'reçue'} au total
            {s.toVerify > 0 && <> · <Link to="/equipe/commandes">{s.toVerify} paiement{s.toVerify > 1 ? 's' : ''} à vérifier</Link></>}
          </p>

          {s.received === 0 ? (
            <div className="st-empty"><b>Aucune commande sur cette période.</b><p>Choisissez une autre période avec les flèches.</p></div>
          ) : (
            <div className="db-grid2">
              <Card title={r.period === 'day' ? "Chiffre d'affaires par heure" : "Chiffre d'affaires par jour"} sub="Touchez une barre pour voir son montant." wide>
                <Columns key={`t-${r.period}-${r.offset}`} bars={timelineBars(data)} money every={r.period === 'month' ? 5 : r.period === 'day' ? 2 : 1} emptyText="Aucune commande payée sur cette période." />
              </Card>

              <Card title="Plats les plus vendus" sub="Par nombre vendu, commandes payées.">
                {data.topProducts.length
                  ? <Ranking rows={data.topProducts} value={(p) => p.quantity} right={(p) => `${p.quantity} vendu${p.quantity > 1 ? 's' : ''}`} sub={(p) => formatPrice(p.revenue)} />
                  : <p className="st-muted db-none">Aucun plat vendu sur cette période.</p>}
              </Card>

              <Card title="Catégories les plus vendues" sub="Par chiffre d'affaires.">
                {data.topCategories.length
                  ? <Ranking rows={data.topCategories} value={(c) => c.revenue} right={(c) => formatPrice(c.revenue)} sub={(c) => `${c.quantity} plat${c.quantity > 1 ? 's' : ''}`} />
                  : <p className="st-muted db-none">Aucun plat vendu sur cette période.</p>}
              </Card>

              <Card title="Heures de pointe" sub="Commandes reçues par heure, sans les annulées.">
                <Columns
                  key={`h-${r.period}-${r.offset}`}
                  bars={hourBars(data.hours, (v, h) => ({ key: h, label: `${h}h`, name: `${h} h – ${h + 1} h`, value: v, detail: v > 1 ? 'commandes' : 'commande' }))}
                  every={2}
                  emptyText="Aucune commande."
                />
              </Card>

              {r.period !== 'day' && (
                <Card title="Jours de pointe" sub="Commandes reçues par jour de la semaine, sans les annulées.">
                  <Columns
                    key={`w-${r.period}-${r.offset}`}
                    bars={data.weekdays.map((v, i) => ({ key: i, label: WEEKDAYS[i], name: cap(WEEKDAYS_LONG[i]), value: v, detail: v > 1 ? 'commandes' : 'commande' }))}
                    emptyText="Aucune commande."
                  />
                </Card>
              )}

              <Card title="Orange Money / Moov Money / Telecel Money" sub="Commandes payées.">
                {paidTotal ? (
                  <>
                    <div className="db-split" role="img" aria-label={data.payments.map((p, i) => `${METHODS[p.method].label} ${shares[i]} %`).join(', ')}>
                      {data.payments.filter((p) => p.paid).map((p) => <span key={p.method} className={METHODS[p.method].cls} style={{ flexGrow: p.paid }} />)}
                    </div>
                    <ul className="db-legend">
                      {data.payments.map((p, i) => (
                        <li key={p.method}>
                          <i className={METHODS[p.method].cls} aria-hidden="true" />
                          <b>{METHODS[p.method].label}</b>
                          <span>{shares[i]} %</span>
                          <small>{plural(p.paid, 'commande')} · {formatPrice(p.revenue)}</small>
                        </li>
                      ))}
                    </ul>
                  </>
                ) : <p className="st-muted db-none">Aucune commande payée sur cette période.</p>}
              </Card>

              <Card title="Livreurs" sub="Commandes livrées sur la période. Temps moyen : du départ à la remise au client.">
                {data.couriers?.length ? (
                  <table className="db-couriers">
                    <thead>
                      <tr><th>Livreur</th><th className="db-n">Livraisons</th><th className="db-n">Temps moyen</th></tr>
                    </thead>
                    <tbody>
                      {data.couriers.map((c) => (
                        <tr key={c.name}>
                          <td>
                            <b>{c.name}</b>
                            {c.withoutCode > 0 && <small className="st-muted" style={{ display: 'block', margin: 0 }}>{c.withoutCode} validée{c.withoutCode > 1 ? 's' : ''} sans code</small>}
                          </td>
                          <td className="db-n">{c.delivered}</td>
                          <td className="db-n">{duration(c.avgMinutes)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : <p className="st-muted db-none">Aucune livraison par un livreur sur cette période.</p>}
              </Card>

              <Card title="Commandes annulées" sub={data.cancellations.count ? `${data.cancellations.count} sur la période, motifs donnés par l'équipe.` : null}>
                {data.cancellations.count ? (
                  <>
                    <h3 className="db-h3">Motifs</h3>
                    <ul className="db-reasons">
                      {data.cancellations.reasons.map((m) => <li key={m.reason}><span>{m.reason}</span><b>{m.count}</b></li>)}
                    </ul>
                    <h3 className="db-h3">Dernières annulations</h3>
                    <ul className="db-cancel">
                      {data.cancellations.latest.map((c) => (
                        <li key={c.reference}>
                          <Link to={`/equipe/commandes/${c.reference}`}><b>{c.reference}</b> · {c.customerName}</Link>
                          <span>{formatPrice(c.amount)}</span>
                          <small>{c.reason || 'Sans motif'} · {fDateTime.format(new Date(c.at))}{c.by ? ` · par ${c.by}` : ''}</small>
                        </li>
                      ))}
                    </ul>
                  </>
                ) : <p className="st-muted db-none">Aucune commande annulée sur cette période.</p>}
              </Card>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
