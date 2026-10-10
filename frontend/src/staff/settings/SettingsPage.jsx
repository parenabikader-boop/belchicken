import { useEffect, useState } from 'react';
import { staffApi } from '../../api/client.js';
import { formatDateTime } from '../orders/labels.js';
import { rememberSettings } from './useAppSettings.js';
import SourcesBox from './SourcesBox.jsx';
import { FEATURE_CLOSED } from '../FeatureGate.jsx';

// Lot 4 : interrupteur d'un réglage. Non inclus dans la formule (fermé par le Prestataire) : bloqué sur « Éteint ».
function SettingSwitch({ settings, name, label, saving, onToggle }) {
  const included = settings.included?.[name] !== false;
  return (
    <div className="rg-switch">
      <label className={`mn-switch${saving || !included ? ' saving' : ''}`}>
        <input type="checkbox" role="switch" checked={settings[name]} disabled={saving || !included} onChange={() => onToggle(name)} aria-label={label} />
        <span className="mn-track" aria-hidden="true" />
        <span className="mn-state">{!included ? 'Non inclus' : settings[name] ? 'Allumé' : 'Éteint'}</span>
      </label>
      {!included && <p className="st-closed-note">{FEATURE_CLOSED}</p>}
    </div>
  );
}

// Page « Réglages » (Patron) : les options du logiciel, toutes éteintes par défaut.
// Éteint = fonctionnement habituel. Lot 4 : le Prestataire décide si chaque option est incluse dans la formule,
// le Patron l'allume ou l'éteint à l'intérieur.
export default function SettingsPage() {
  const [settings, setSettings] = useState(null);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    staffApi.settings().then(setSettings, setError);
  }, []);

  const toggle = async (key) => {
    setSaving(true);
    try {
      const next = await staffApi.setSettings({ [key]: !settings[key] });
      rememberSettings(next);
      setSettings(next);
      setError(null);
    } catch (e) {
      setError(e);
    }
    setSaving(false);
  };

  return (
    <div className="rg">
      <div className="st-head"><h1 className="st-title">Réglages</h1></div>
      <p className="st-muted rg-intro">Options du logiciel. Éteintes, tout fonctionne comme d’habitude.</p>
      {error && <div className="alert err" role="alert"><span>{error.message}</span></div>}
      {!settings && !error && <p className="st-muted">Chargement…</p>}
      {settings && (
        <section className="st-box rg-opt">
          <div className="rg-row">
            <div className="rg-text">
              <h2>Parcours court</h2>
              <p>
                Un seul bouton <b>« Paiement vérifié »</b> fait passer la commande de « À vérifier » directement à
                « En préparation », avec <b>un seul message</b> au client : paiement reçu, commande en préparation et frais de livraison.
              </p>
              <ul className="rg-list">
                <li><b>Éteint</b> : deux étapes comme aujourd’hui (« Confirmer le paiement », puis « Lancer la préparation »), deux messages.</li>
                <li>Les frais de livraison, le motif s’ils changent et la confirmation de l’envoi du message restent demandés.</li>
                <li>Les commandes déjà « Payées » continuent leur parcours habituel.</li>
              </ul>
            </div>
            <SettingSwitch settings={settings} name="shortFlow" label="Parcours court" saving={saving} onToggle={toggle} />
          </div>
          <div className="rg-row rg-sep">
            <div className="rg-text">
              <h2>Prise de commande par l’agent</h2>
              <p>
                Un bouton <b>« Nouvelle commande »</b> sur la page Commandes : l’agent saisit une commande reçue
                <b> par appel ou sur WhatsApp</b>, avec sa provenance. Elle suit ensuite le même parcours que le site (paiement vérifié avant).
              </p>
              <ul className="rg-list">
                <li><b>Éteint</b> : seules les commandes du site arrivent, comme aujourd’hui.</li>
                <li>Le détail et le bon indiquent toujours la provenance, « Saisie par » et « Paiement vérifié par ».</li>
                <li>Provenance WhatsApp : l’agent voit à chaque étape depuis quel numéro écrire au client.</li>
              </ul>
            </div>
            <SettingSwitch settings={settings} name="agentOrders" label="Prise de commande par l’agent" saving={saving} onToggle={toggle} />
          </div>
          <div className="rg-row rg-sep">
            <div className="rg-text">
              <h2>Tournées et disponibilité des livreurs</h2>
              <p>
                Vos livreurs indiquent sur leur page s’ils sont <b>Disponibles</b> ou <b>En pause</b> ; « En course » s’affiche
                tout seul. Au départ d’une commande, l’agent voit l’état de chaque livreur ; un livreur en pause ne peut pas être choisi.
              </p>
              <ul className="rg-list">
                <li><b>Éteint</b> : comme aujourd’hui, tous les livreurs actifs sont proposés, sans bouton de disponibilité.</li>
                <li>L’agent peut aussi mettre un livreur en pause ou le rendre disponible (téléphone éteint, absence).</li>
                <li>Concerne seulement les livreurs du restaurant.</li>
              </ul>
            </div>
            <SettingSwitch settings={settings} name="restaurantDispatch" label="Tournées et disponibilité des livreurs" saving={saving} onToggle={toggle} />
          </div>
          {settings.updatedByName && (
            <p className="st-muted rg-who">Dernier changement : {settings.updatedByName}, le {formatDateTime(settings.updatedAt)}.</p>
          )}
        </section>
      )}
      {settings && <SourcesBox />}
    </div>
  );
}
