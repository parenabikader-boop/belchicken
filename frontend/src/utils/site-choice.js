// Lot 11 : quel menu afficher sur /menu, sans accès au réseau (testé dans utils/site-choice.test.js).
// stored : dernière réponse gardée dans le téléphone ('1' allumé, '0' éteint, null jamais reçue) ;
// answer : réponse de GET /api/site ({ menuBorne }), null tant qu'elle n'est pas arrivée ou si le serveur est
// injoignable ; done : la demande est terminée (réussie ou non).
// Résultat : true = menu façon borne, false = menu actuel, null = attendre (première visite, pas de clignotement).
export function kioskMenuState(stored, answer, done) {
  if (answer) return answer.menuBorne === true;
  if (stored === '1') return true;
  if (stored === '0') return false;
  return done ? false : null; // serveur injoignable à la première visite : le menu actuel
}

// /menu/:categorie et /menu/:categorie/... seulement (pas /menus, ni /menu-borne)
export const isMenuPath = (pathname) => /^\/menu(\/|$)/.test(pathname);
