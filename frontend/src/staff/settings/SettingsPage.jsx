import { useEffect, useState } from 'react';
import { staffApi } from '../../api/client.js';
import { formatDateTime } from '../orders/labels.js';
import { rememberSettings } from './useAppSettings.js';
import SourcesBox from './SourcesBox.jsx';

// Page « Réglages » (Patron) : les options du logiciel, toutes éteintes par défaut.
// Éteint = fonctionnement habituel. Le compte Prestataire (lot 4) reprendra ces interrupteurs.
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
            <label className={`mn-switch${saving ? ' saving' : ''}`}>
              <input type="checkbox" role="switch" checked={settings.shortFlow} disabled={saving} onChange={() => toggle('shortFlow')} aria-label="Parcours court" />
              <span className="mn-track" aria-hidden="true" />
              <span className="mn-state">{settings.shortFlow ? 'Allumé' : 'Éteint'}</span>
            </label>
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
            <label className={`mn-switch${saving ? ' saving' : ''}`}>
              <input type="checkbox" role="switch" checked={settings.agentOrders} disabled={saving} onChange={() => toggle('agentOrders')} aria-label="Prise de commande par l’agent" />
              <span className="mn-track" aria-hidden="true" />
              <span className="mn-state">{settings.agentOrders ? 'Allumé' : 'Éteint'}</span>
            </label>
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
