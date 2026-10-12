import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
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
          <div className="rg-row rg-sep">
            <div className="rg-text">
              <h2>Demander l’avis des clients</h2>
              <p>
                Le message de remerciement, après la livraison ou le retrait, contient un lien <b>« Donnez votre avis »</b> :
                le client note le call center, le restaurant et la livraison de 1 à 5 étoiles, avec un commentaire s’il le souhaite.
              </p>
              <ul className="rg-list">
                <li><b>Éteint</b> : le message de remerciement reste comme aujourd’hui, sans lien.</li>
                <li>Un seul avis par commande, dans les 7 jours. Le lien est impossible à deviner.</li>
                <li>Une note de 2 étoiles ou moins vous envoie une alerte, pour rappeler le client vite.</li>
                <li>Moyennes et commentaires : onglet « Avis » de la page Tableau de bord.</li>
              </ul>
            </div>
            <SettingSwitch settings={settings} name="reviewsEnabled" label="Demander l’avis des clients" saving={saving} onToggle={toggle} />
          </div>
          <div className="rg-row rg-sep">
            <div className="rg-text">
              <h2>Site en anglais</h2>
              <p>
                Un bouton <b>FR / EN</b> s’affiche en haut du site : le client peut le lire en anglais (boutons, étapes, paiement,
                frais de livraison, suivi, avis, infos pratiques). Le site s’ouvre toujours en français, et le choix du client
                est retenu pour sa prochaine visite.
              </p>
              <ul className="rg-list">
                <li><b>Éteint</b> : le site reste en français, sans bouton, comme aujourd’hui.</li>
                <li>Les noms et descriptions des plats, catégories et boissons restent tels que vous les écrivez.</li>
                <li>Les messages WhatsApp et l’espace équipe restent en français.</li>
                <li>Une commande passée en anglais affiche « Client anglophone » dans son détail.</li>
              </ul>
            </div>
            <SettingSwitch settings={settings} name="englishSite" label="Site en anglais" saving={saving} onToggle={toggle} />
          </div>
          <div className="rg-row rg-sep">
            <div className="rg-text">
              <h2>Menu façon borne</h2>
              <p>
                La page <b>Menu</b> du site s’affiche en plein écran, comme les bornes de commande du restaurant : une catégorie
                à la fois, choisie dans la colonne (ou la bande du haut sur téléphone), et les sauces, frites et boissons
                proposées dans la fiche de chaque plat.
              </p>
              <ul className="rg-list">
                <li><b>Éteint</b> : le menu du site reste comme aujourd’hui.</li>
                <li>Mêmes plats, mêmes prix et même panier : seule la page du menu change.</li>
                <li>Les sauces, frites et accompagnements proposés sont les plats disponibles de la catégorie Extras.</li>
              </ul>
            </div>
            <SettingSwitch settings={settings} name="kioskMenu" label="Menu façon borne" saving={saving} onToggle={toggle} />
          </div>
          <div className="rg-row rg-sep">
            <div className="rg-text">
              <h2>Nouvelle page Commandes et barre ⋮</h2>
              <p>
                Allume <b>trois choses ensemble</b> pour toute l’équipe :
              </p>
              <ul className="rg-list">
                <li>
                  la <b>nouvelle page Commandes</b>, plus lisible les soirs d’affluence : cartes plus compactes, couleur selon
                  l’attente, commandes en retard en haut, étapes vides cachées, et un bandeau qui compte les retards et les
                  messages à confirmer ;
                </li>
                <li>
                  la <b>barre simple</b> en haut de l’espace équipe : le nom de la page, Alertes, et un bouton <b>⋮</b> qui ouvre
                  toutes les pages sur le côté, avec le nom de la personne connectée et Déconnexion ;
                </li>
                <li>
                  la <b>page d’arrivée</b> selon le rôle : le Patron arrive sur le Tableau de bord (sur Commandes si le Tableau
                  de bord n’est pas inclus dans la formule), l’Opérateur sur Commandes.
                </li>
                <li><b>Éteint</b> : la page Commandes, la barre du haut et la page d’arrivée (Commandes) restent comme aujourd’hui.</li>
                <li>Mêmes commandes, mêmes étapes, mêmes boutons et mêmes droits : seule la présentation change.</li>
                <li>Vous pouvez les essayer avant de les allumer : <Link to="/equipe/commandes-v2">Voir la nouvelle page</Link>.</li>
              </ul>
            </div>
            <SettingSwitch settings={settings} name="newOrdersPage" label="Nouvelle page Commandes et barre ⋮" saving={saving} onToggle={toggle} />
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
