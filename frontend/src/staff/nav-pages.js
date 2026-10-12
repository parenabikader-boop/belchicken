// Pages de l'espace équipe dans le panneau « ⋮ » (StaffNav.jsx), sans React : testé dans nav-pages.test.js.
// Mêmes règles que l'ancienne barre (StaffApp.jsx) : chaque rôle ne voit que ses pages ; l'API vérifie aussi.
// role : PATRON, OPERATEUR, PRESTATAIRE ; patron : isPatronLevel(role) ; hasFeature(key) : interrupteurs du
// Prestataire ; chiffres : adresse du tableau de bord (ou des ventes, des avis) si l'une est ouverte, sinon null.
export function staffPages({ role, patron, hasFeature, chiffres }) {
  const prestataire = role === 'PRESTATAIRE';
  const pages = [
    { to: '/equipe/commandes', label: 'Commandes', match: /^\/equipe\/commandes(-v2)?(\/|$)/ },
    { to: '/equipe/menu', label: 'Menu', match: /^\/equipe\/menu(\/|$)/ },
    hasFeature('CAISSE') && { to: '/equipe/caisse', label: 'Caisse', match: /^\/equipe\/caisse/ },
    patron && hasFeature('FRAIS_LIVRAISON') && { to: '/equipe/frais-livraison', label: 'Frais de livraison', match: /^\/equipe\/frais-livraison/ },
    patron && chiffres && { to: chiffres, label: 'Tableau de bord', match: /^\/equipe\/(tableau-de-bord|ventes|avis)/ },
    patron && { to: '/equipe/equipe', label: 'Équipe', match: /^\/equipe\/equipe/ },
    patron && hasFeature('REGLAGES') && { to: '/equipe/reglages', label: 'Réglages', match: /^\/equipe\/reglages/ },
    patron && { to: '/equipe/accueil', label: 'Accueil du site', match: /^\/equipe\/accueil/ },
    prestataire && { to: '/equipe/prestataire', label: 'Prestataire', match: /^\/equipe\/prestataire/ },
    prestataire && { to: '/equipe/livraison', label: 'Livraison', match: /^\/equipe\/livraison/ },
    // Lot 5d : le Patron (RELEVE ouvert) ; le Prestataire passe par l'onglet « Relevé » de la page Livraison
    !prestataire && patron && hasFeature('RELEVE') && { to: '/equipe/releve', label: 'Relevé', match: /^\/equipe\/releve/ },
  ];
  return pages.filter(Boolean);
}

// Pages hors du panneau, avec leur nom dans la barre
const OTHER_TITLES = [
  [/^\/equipe\/commandes\/nouvelle/, 'Nouvelle commande'],
  [/^\/equipe\/commandes\/[^/]+/, 'Commande'],
  [/^\/equipe\/alertes/, 'Alertes'],
  [/^\/equipe\/mot-de-passe/, 'Mon mot de passe'],
];

// Nom de la page actuelle, affiché dans la barre
export function pageTitle(pathname, pages) {
  const other = OTHER_TITLES.find(([re]) => re.test(pathname));
  if (other) return other[1];
  return pages.find((p) => p.match.test(pathname))?.label ?? 'Espace équipe';
}

// Page d'arrivée de l'équipe (connexion, /equipe). Réglage « Nouvelle page Commandes et barre ⋮ » allumé : le Patron
// arrive sur le Tableau de bord (s'il est ouvert par le Prestataire, sinon Commandes), l'Opérateur sur Commandes.
// Éteint, et pour les autres rôles de cet espace (Prestataire) : Commandes, comme avant. Le livreur et le
// Responsable livraison ont leurs propres pages (StaffApp.jsx), inchangées.
export function teamHome({ role, newOrdersPage, hasFeature }) {
  if (newOrdersPage && role === 'PATRON' && hasFeature('TABLEAU_DE_BORD')) return '/equipe/tableau-de-bord';
  return '/equipe/commandes';
}
