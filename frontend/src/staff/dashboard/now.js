// Tableau de bord, bloc « Maintenant » : ce qui demande une action, en direct (testé dans now.test.js).
// Aucune lecture de plus : la liste des commandes en cours déjà rechargée toutes les 5 s par l'espace équipe
// (OrdersFeed.jsx), avec les mêmes règles et les mêmes seuils que la nouvelle page Commandes (orders2/waiting.js).
import { ACTIVE } from '../orders/labels.js';
import { summary } from '../orders2/waiting.js';

// orders, counts : fil des commandes ({ status: 'EN_COURS' }). Les compteurs « à vérifier » et « à remercier »
// viennent des compteurs du serveur : toutes les commandes, quelle que soit leur date.
export function nowSummary(orders = [], counts = {}, now = Date.now()) {
  const active = orders.filter((o) => ACTIVE.includes(o.status) || (o.status === 'LIVREE' && o.toThank));
  const s = summary(active, now);
  return {
    inProgress: s.total,
    late: s.late,
    warn: s.warn,
    notice: s.notice,
    toVerify: counts.PAIEMENT_A_VERIFIER || 0,
    toThank: counts.A_REMERCIER || 0,
  };
}

// Rien à faire : aucune ligne à afficher (« Tout est à jour »)
export const allClear = (n, { reviewsToCall = 0, cash = 0 } = {}) =>
  !n.late && !n.toVerify && !n.notice && !n.toThank && !reviewsToCall && !cash;
