import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { staffApi } from '../../api/client.js';
import { useStaff } from '../StaffContext.jsx';
import { CashBoard } from '../cash/CashPage.jsx';
import { TeamManager } from '../team/TeamPage.jsx';
import { formatPhone, timeAgo } from '../orders/labels.js';
import { plural } from '../../utils/format.js';
import DispatchBoard from './DispatchBoard.jsx';
import StatementPage from '../statement/StatementPage.jsx';

const REFRESH_MS = 15000;

// /equipe/livraison (lot 5b) : notre équipe de livraison. Responsable livraison et Prestataire.
//   - Livreurs : Disponible / En pause (En course calculé), et nos courses en cours (frais de livraison seulement).
//   - Caisse : frais des commandes livrées par notre équipe (mode Prestataire), jamais celles du restaurant.
//   - Équipe : comptes de nos livreurs (le Prestataire crée aussi les Responsables livraison).
// Jamais les ventes de Belchicken : ni plats, ni totaux, ni paiement des plats (l'API ne les donne pas).
// Adresse : ?onglet=livreurs|caisse|equipe|releve, ?caisse=verifier|livreurs, ?du=&au= (relevé)
const TABS = [
  { key: 'livreurs', label: 'Livreurs' },
  { key: 'caisse', label: 'Caisse' },
  { key: 'equipe', label: 'Comptes' },
  { key: 'releve', label: 'Relevé' }, // lot 5d : sans conditions ni montant dû pour le Responsable livraison
];

const PARTNER_CASH = { load: staffApi.deliveryCash, verify: staffApi.verifyDeliveryFee, remit: staffApi.remitDeliveryCash };

const TEAM_ACTIONS = {
  list: staffApi.deliveryTeam,
  create: staffApi.createDeliveryMember,
  reset: staffApi.resetDeliveryMember,
  deactivate: staffApi.deactivateDeliveryMember,
  reactivate: staffApi.reactivateDeliveryMember,
};

const COURIER_ROLE = {
  role: 'LIVREUR',
  help: 'Livreur de notre équipe : voit seulement ses courses du jour (client, adresse, plats et frais à encaisser), se met disponible ou en pause et valide la remise avec le code du client.',
};
const MANAGER_ROLE = {
  role: 'RESPONSABLE_LIVRAISON',
  help: 'Gère nos livreurs (disponibilité, comptes) et notre caisse. Ne voit jamais les ventes de Belchicken.',
};

export default function DeliveryPage() {
  const { user } = useStaff();
  const [params, setParams] = useSearchParams();
  const tab = TABS.some((t) => t.key === params.get('onglet')) ? params.get('onglet') : 'livreurs';
  const cashTab = params.get('caisse') === 'livreurs' ? 'livreurs' : 'verifier';
  const roles = user.role === 'PRESTATAIRE' ? [COURIER_ROLE, MANAGER_ROLE] : [COURIER_ROLE];

  return (
    <div className="dl">
      <div className="st-head">
        <h1 className="st-title">Livraison</h1>
        <span className="st-muted">Notre équipe de livreurs</span>
      </div>
      <nav className="od-tabs" aria-label="Livraison">
        {TABS.map((t) => (
          <button key={t.key} type="button" className={`od-tab${tab === t.key ? ' on' : ''}`} aria-pressed={tab === t.key} onClick={() => setParams(t.key === 'livreurs' ? {} : { onglet: t.key })}>
            {t.label}
          </button>
        ))}
      </nav>
      {tab === 'livreurs' && <Couriers />}
      {tab === 'caisse' && (
        <CashBoard
          partner
          tab={cashTab}
          onTab={(t) => setParams(t === 'livreurs' ? { onglet: 'caisse', caisse: 'livreurs' } : { onglet: 'caisse' })}
          cashApi={PARTNER_CASH}
        />
      )}
      {tab === 'releve' && <StatementPage embedded />}
      {tab === 'equipe' && (
        <TeamManager
          heading="h2"
          title="Comptes de notre équipe"
          intro="Chacun se connecte à l’espace équipe avec son numéro et son propre mot de passe. Chaque création, mot de passe provisoire, désactivation ou réactivation est notée dans le journal de sécurité."
          roles={roles}
          actions={TEAM_ACTIONS}
        />
      )}
    </div>
  );
}

// Nos livreurs et leur état, puis nos courses en cours
function Couriers() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');

  const load = useCallback(async () => {
    try {
      setData(await staffApi.deliveryOverview());
      setError('');
    } catch (e) {
      setError(e.message);
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, REFRESH_MS);
    return () => clearInterval(t);
  }, [load]);

  async function toggle(c) {
    setBusy(c.id);
    setError('');
    try {
      setData(await staffApi.setDeliveryAvailability(c.id, c.availability === 'EN_PAUSE' ? 'DISPONIBLE' : 'EN_PAUSE'));
    } catch (e) {
      setError(e.message);
    }
    setBusy('');
  }

  if (!data) return error ? <div className="alert err" role="alert"><span>{error}</span></div> : <p className="st-muted">Chargement…</p>;
  const count = (state) => data.couriers.filter((c) => c.state === state).length;

  return (
    <>
      {error && <div className="alert err" role="alert" style={{ marginBottom: 12 }}><span>{error}</span></div>}
      <p className="od-hint">
        {plural(count('DISPONIBLE'), 'disponible')} · {count('EN_COURSE')} en course · {count('EN_PAUSE')} en pause.
        Un livreur en pause ne peut pas recevoir de course. « En course » s’affiche tout seul.
      </p>
      {data.couriers.length === 0 ? (
        <p className="od-empty">Aucun livreur actif dans notre équipe. Créez-les dans l’onglet « Comptes ».</p>
      ) : (
        <ul className="dl-list">
          {data.couriers.map((c) => (
            <li key={c.id} className="dl-row">
              <div className="dl-main">
                <b>{c.name}</b>
                <small>
                  <a href={`tel:${c.phone}`}>{formatPhone(c.phone)}</a>
                  {c.activeCourses > 0 && ` · ${plural(c.activeCourses, 'course')} en cours`}
                  {c.availabilityChangedAt && ` · changé ${timeAgo(c.availabilityChangedAt)}`}
                </small>
              </div>
              <span className={`av-pill ${c.state.toLowerCase()}`}>{STATE_LABEL[c.state]}</span>
              <button type="button" className="btn btn-s btn-sm" disabled={busy === c.id} onClick={() => toggle(c)}>
                {c.availability === 'EN_PAUSE' ? 'Rendre disponible' : 'Mettre en pause'}
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Lot 5c : à attribuer, à récupérer, en cours, livrées aujourd'hui */}
      <DispatchBoard data={data} onData={setData} />
    </>
  );
}

const STATE_LABEL = { DISPONIBLE: 'Disponible', EN_PAUSE: 'En pause', EN_COURSE: 'En course' };
