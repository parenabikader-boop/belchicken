// Tableau de bord : comment afficher une comparaison (règles sans affichage, testées dans compare.test.js).
// Demande du client (13 octobre 2026) : comparer à la même heure, et pas de rouge quand la journée commence à
// peine (« 0 F, −100 % » en rouge à 7 h du matin ne veut rien dire).
//
// « Commence à peine » : période en cours (aujourd'hui, cette semaine, ce mois) dont la comparaison au même moment
// compte moins de EARLY_MIN commandes payées. On écrit alors « trop tôt pour comparer », en gris, sans pourcentage.
export const EARLY_MIN = 5;

export const isEarly = ({ inProgress, basePaid }) => Boolean(inProgress) && basePaid != null && basePaid < EARLY_MIN;

// Renvoie { kind, pct } : kind = 'early' (trop tôt), 'none' (rien à comparer), 'flat', 'good', 'bad'.
// upIsBad : pour les annulations, une hausse est une mauvaise nouvelle.
export function compareState({ now, before, inProgress = false, basePaid = null, upIsBad = false }) {
  if (isEarly({ inProgress, basePaid })) return { kind: 'early', pct: null };
  if (!before) return { kind: 'none', pct: null };
  const pct = Math.round(((now - before) / before) * 100);
  if (pct === 0) return { kind: 'flat', pct };
  return { kind: pct > 0 !== upIsBad ? 'good' : 'bad', pct };
}

// « +12 % », « −40 % »
export const pctText = (pct) => `${pct > 0 ? '+' : '−'}${Math.abs(pct)} %`;
