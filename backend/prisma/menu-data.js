// Menu officiel Belchicken, transcrit depuis les visuels envoyés aux clients.
// Toute modification ici est appliquée par `npm run db:seed` (idempotent).

const img = (name) => `/menu/${name}.jpg`;

// Menu (avec frites + boisson) ou produit seul au "prix unique"
const menuOrSeul = (menu, seul, seulLabel = 'Seul', menuSub = 'Avec frites et boisson') => [
  { code: 'menu', label: 'Menu', subLabel: menuSub, price: menu },
  { code: 'seul', label: seulLabel, subLabel: 'Sans accompagnement', price: seul },
];
const sizes = (l, xl) => [
  { code: 'L', label: 'Taille L', price: l },
  { code: 'XL', label: 'Taille XL', price: xl },
];
const pieces = (list) =>
  list.map(([n, price]) => ({ code: `${n}pc`, label: `${n} pièce${n > 1 ? 's' : ''}`, price }));
const single = (price) => [{ code: 'standard', label: 'Standard', price }];

export const categories = [
  {
    slug: 'burgers', name: 'Burgers',
    description: 'Chaque burger existe en menu, avec frites et boisson, ou seul.',
    groups: [
      { name: 'Originals', note: 'N° 7 à 9' },
      { name: 'XL Burgers', note: 'N° 10' },
      { name: 'Bœuf', note: 'N° 11 et 12' },
    ],
  },
  {
    slug: 'poulet', name: 'Poulet frit',
    description: 'Les formules incluent frites et boisson, sauf le Chicken Pop Corn. Les Fuego Wings sont épicés.',
    groups: [
      { name: 'Wings', note: 'N° 16 à 18' },
      { name: 'Tenders', note: 'N° 19 à 21' },
      { name: 'Fuego Wings', note: 'N° 29 à 31' },
      { name: 'Spécialités', note: 'N° 22 et 23' },
    ],
  },
  { slug: 'combos', name: "Chef's Combo", description: 'Chaque plateau comprend frites et boisson.', groups: [{ name: 'Plateaux', note: 'N° 13 à 15' }] },
  { slug: 'buckets', name: 'Buckets', description: 'À partager en famille ou entre amis.', groups: [{ name: 'À partager', note: 'N° 26 à 28' }] },
  { slug: 'wraps', name: 'Wraps', description: 'Chaque wrap existe en menu, avec frites et boisson, ou seul.', groups: [{ name: 'Wraps', note: 'N° 3 à 5' }] },
  { slug: 'rice-box', name: 'Rice Box', description: 'Chaque box comprend deux beignets et une boisson.', groups: [{ name: 'Rice Box', note: 'N° 24 et 25' }] },
  { slug: 'salades', name: 'Salades', description: 'En menu avec boisson, ou seule.', groups: [{ name: 'Salades', note: 'N° 1 et 2' }] },
  { slug: 'bel-kids', name: 'Bel Kids', description: "La box inclut l'accès à la salle de jeu du restaurant.", groups: [{ name: 'Bel Kids', note: 'N° 6' }] },
  {
    slug: 'extras', name: 'Extras',
    description: 'Pour compléter un menu ou composer votre assiette.',
    groups: [{ name: 'Accompagnements' }, { name: 'Poulet à la pièce' }, { name: 'Sauces' }],
  },
];

// group = nom du sous-groupe dans la catégorie
export const products = [
  // ── Burgers ──
  { slug: 'finest', number: 7, category: 'burgers', group: 'Originals', name: 'Finest', description: 'Poulet croustillant, salade, sauce crémeuse.', imageUrl: img('finest'), variants: menuOrSeul(5500, 4000, 'Burger seul') },
  { slug: 'smoky', number: 8, category: 'burgers', group: 'Originals', name: 'Smoky', description: 'Poulet croustillant, cheddar, pickles.', imageUrl: img('smoky'), variants: menuOrSeul(5500, 4000, 'Burger seul') },
  { slug: 'grill', number: 9, category: 'burgers', group: 'Originals', name: 'Grill', description: 'Filet de poulet grillé, salade, sauce.', imageUrl: img('grill'), variants: menuOrSeul(5500, 4000, 'Burger seul') },
  { slug: 'finest-xl', number: 10, category: 'burgers', group: 'XL Burgers', name: 'Finest XL', description: 'Le Finest en format XL.', imageUrl: img('finest'), variants: menuOrSeul(6500, 5000, 'Burger seul') },
  { slug: 'smoky-xl', number: 10, category: 'burgers', group: 'XL Burgers', name: 'Smoky XL', description: 'Le Smoky en format XL.', imageUrl: img('smoky'), variants: menuOrSeul(6500, 5000, 'Burger seul') },
  { slug: 'grill-xl', number: 10, category: 'burgers', group: 'XL Burgers', name: 'Grill XL', description: 'Le Grill en format XL.', imageUrl: img('grill'), variants: menuOrSeul(6500, 5000, 'Burger seul') },
  { slug: 'extreme-beef', number: 11, category: 'burgers', group: 'Bœuf', name: 'Extreme Beef', description: 'Steak de bœuf, tomate, salade.', imageUrl: img('extreme'), variants: menuOrSeul(5500, 4000, 'Burger seul') },
  { slug: 'magnifique', number: 12, category: 'burgers', group: 'Bœuf', name: 'Magnifique', description: 'Double steak de bœuf, cheddar, tomate.', imageUrl: img('magnifique'), variants: menuOrSeul(6500, 5000, 'Burger seul') },

  // ── Poulet frit ──
  { slug: 'wings-4', number: 16, category: 'poulet', group: 'Wings', name: 'Wings 4 pièces', composition: ['4 wings', 'Frites', 'Boisson'], imageUrl: img('wings'), variants: single(5000) },
  { slug: 'wings-8', number: 17, category: 'poulet', group: 'Wings', name: 'Wings 8 pièces', composition: ['8 wings', 'Frites', 'Boisson'], imageUrl: img('wings12'), variants: single(7500) },
  { slug: 'wings-12', number: 18, category: 'poulet', group: 'Wings', name: 'Wings 12 pièces', composition: ['12 wings', 'Frites', 'Boisson'], imageUrl: img('wings12'), variants: single(10000) },
  { slug: 'tenders-4', number: 19, category: 'poulet', group: 'Tenders', name: 'Tenders 4 pièces', composition: ['4 tenders', 'Frites', 'Boisson'], imageUrl: img('tenders'), variants: single(6000) },
  { slug: 'tenders-8', number: 20, category: 'poulet', group: 'Tenders', name: 'Tenders 8 pièces', composition: ['8 tenders', 'Frites', 'Boisson'], imageUrl: img('tenders'), variants: single(10000) },
  { slug: 'tenders-12', number: 21, category: 'poulet', group: 'Tenders', name: 'Tenders 12 pièces', composition: ['12 tenders', 'Frites', 'Boisson'], imageUrl: img('tenders'), variants: single(15000) },
  { slug: 'fuego-wings-4', number: 29, category: 'poulet', group: 'Fuego Wings', name: 'Fuego Wings 4 pièces', composition: ['4 wings épicés', 'Frites', 'Boisson'], imageUrl: img('fuego'), isSpicy: true, variants: single(6500) },
  { slug: 'fuego-wings-8', number: 30, category: 'poulet', group: 'Fuego Wings', name: 'Fuego Wings 8 pièces', composition: ['8 wings épicés', 'Frites', 'Boisson'], imageUrl: img('fuego'), isSpicy: true, variants: single(9500) },
  { slug: 'fuego-wings-12', number: 31, category: 'poulet', group: 'Fuego Wings', name: 'Fuego Wings 12 pièces', composition: ['12 wings épicés', 'Frites', 'Boisson'], imageUrl: img('fuego'), isSpicy: true, variants: single(12500) },
  { slug: 'special-belchicken', number: 22, category: 'poulet', group: 'Spécialités', name: 'Spécial Belchicken', composition: ['1 wing', '1 tender', '1 pilon', '1 haut de cuisse', '1 chicken pop corn', '1 frites', '2 beignets', '1 boisson'], imageUrl: img('special'), variants: single(7500) },
  { slug: 'chicken-pop-corn', number: 23, category: 'poulet', group: 'Spécialités', name: 'Chicken Pop Corn', description: 'Bouchées de poulet croustillantes.', imageUrl: img('popcorn'), variants: sizes(1500, 2000) },

  // ── Chef's Combo ──
  { slug: 'chefs-combo', number: 13, category: 'combos', group: 'Plateaux', name: "Chef's Combo", composition: ['1 Finest burger', '1 tenders', '2 wings', '1 chicken pop corn L', '2 beignets', '1 frites', '1 boisson'], imageUrl: img('chefs'), variants: single(8500) },
  { slug: 'boneless-combo', number: 14, category: 'combos', group: 'Plateaux', name: 'Boneless Combo', composition: ['1 Finest burger', '1 tenders', '2 chicken pop corn XL', '2 beignets', '1 frites', '1 boisson'], imageUrl: img('boneless'), variants: single(8500) },
  { slug: 'chefs-choice', number: 15, category: 'combos', group: 'Plateaux', name: "Chef's Choice", composition: ['2 wings', '2 tenders', '2 chicken pop corn XL', '2 beignets', '1 frites', '1 boisson'], imageUrl: img('choice'), variants: single(8500) },

  // ── Buckets ──
  { slug: 'family-bucket', number: 26, category: 'buckets', group: 'À partager', name: 'Family Bucket', serves: '4 personnes', composition: ['4 wings', '4 tenders', '4 pilons', '4 hauts de cuisse', '4 frites', '4 boissons', '12 beignets'], imageUrl: img('family'), variants: single(28000) },
  { slug: 'friends-bucket', number: 27, category: 'buckets', group: 'À partager', name: 'Friends Bucket', serves: '2 à 3 personnes', composition: ['4 wings', '4 tenders', '2 pilons', '2 hauts de cuisse', '6 beignets', '2 frites', '2 boissons'], imageUrl: img('friends'), variants: single(15000) },
  { slug: 'bucket-for-2', number: 28, category: 'buckets', group: 'À partager', name: 'Bucket for 2', serves: '2 personnes', composition: ['4 wings', '2 tenders', '2 hauts de cuisse', '2 pilons'], imageUrl: img('bucket2'), variants: single(13000) },

  // ── Wraps ──
  { slug: 'fried-chicken-wrap', number: 3, category: 'wraps', group: 'Wraps', name: 'Fried Chicken Wrap', description: 'Poulet frit croustillant.', imageUrl: img('wrap_fried'), variants: menuOrSeul(5500, 4000, 'Wrap seul') },
  { slug: 'kebab-wrap', number: 4, category: 'wraps', group: 'Wraps', name: 'Kebab Wrap', description: 'Viande kebab, sauce blanche.', imageUrl: img('wrap_kebab'), variants: menuOrSeul(5500, 4000, 'Wrap seul') },
  { slug: 'fuego-wrap', number: 5, category: 'wraps', group: 'Wraps', name: 'Fuego Wrap', description: 'Poulet croustillant, sauce piquante.', imageUrl: img('wrap_fuego'), isSpicy: true, variants: menuOrSeul(6500, 5000, 'Wrap seul') },

  // ── Rice Box ──
  { slug: 'belgrill-rice-box', number: 24, category: 'rice-box', group: 'Rice Box', name: 'Belgrill Rice Box', composition: ['Fried rice', 'Poulet grillé', '2 beignets', '1 boisson'], imageUrl: img('rice_belgrill'), variants: single(4500) },
  { slug: 'belicious-rice-box', number: 25, category: 'rice-box', group: 'Rice Box', name: 'Belicious Rice Box', composition: ['Spicy rice', '1 tender', 'Alloco', '2 beignets', '1 boisson'], imageUrl: img('rice_belicious'), variants: single(6000) },

  // ── Salades ──
  { slug: 'kebab-salad', number: 1, category: 'salades', group: 'Salades', name: 'Kebab Salad', description: 'Salade fraîche et viande kebab.', imageUrl: img('salad_kebab'), variants: menuOrSeul(4500, 4000, 'Salade seule', 'Avec boisson') },
  { slug: 'chicken-salad', number: 2, category: 'salades', group: 'Salades', name: 'Chicken Salad', description: 'Salade fraîche et poulet, grillé ou frit.', imageUrl: img('salad_chicken'), choiceLabel: 'Cuisson du poulet', choices: ['Grillé', 'Frit'], variants: menuOrSeul(4500, 4000, 'Salade seule', 'Avec boisson') },

  // ── Bel Kids ──
  { slug: 'belkids-box', number: 6, category: 'bel-kids', group: 'Bel Kids', name: 'BelKids Box', composition: ['1 chicken burger', '1 chicken pop corn L', '2 beignets', '1 frites', '1 jus', 'Accès salle de jeu'], imageUrl: img('kids'), variants: single(5000) },

  // ── Extras ──
  { slug: 'frites', category: 'extras', group: 'Accompagnements', name: 'Frites', imageUrl: img('fries'), variants: sizes(1000, 1500) },
  { slug: 'alloco', category: 'extras', group: 'Accompagnements', name: 'Alloco', imageUrl: img('alloco'), variants: single(1500) },
  { slug: 'fried-rice', category: 'extras', group: 'Accompagnements', name: 'Fried Rice', imageUrl: img('rice_bowl'), variants: single(1500) },
  { slug: 'beignets-12', category: 'extras', group: 'Accompagnements', name: 'Beignets', description: '12 pièces.', imageUrl: img('beignets'), variants: single(3000) },
  { slug: 'salade-de-chou', category: 'extras', group: 'Accompagnements', name: 'Salade de chou', variants: single(500) },
  { slug: 'wings-piece', category: 'extras', group: 'Poulet à la pièce', name: 'Wings', imageUrl: img('wings'), variants: pieces([[1, 1000], [4, 3500], [8, 6000], [16, 11000]]) },
  { slug: 'tenders-piece', category: 'extras', group: 'Poulet à la pièce', name: 'Tenders', imageUrl: img('tenders'), variants: pieces([[1, 1500], [4, 5000], [8, 9000], [16, 16000]]) },
  // À VÉRIFIER : le visuel indique 10 000 F pour 8 pièces seules, plus cher que le menu N° 30 (9 500 F).
  { slug: 'fuego-wings-piece', category: 'extras', group: 'Poulet à la pièce', name: 'Fuego Wings', imageUrl: img('fuego'), isSpicy: true, variants: pieces([[4, 4500], [8, 10000], [16, 15000]]) },
  { slug: 'pilon', category: 'extras', group: 'Poulet à la pièce', name: 'Pilon', imageUrl: img('pieces'), variants: single(1500) },
  { slug: 'haut-de-cuisse', category: 'extras', group: 'Poulet à la pièce', name: 'Haut de cuisse', imageUrl: img('pieces'), variants: single(1500) },
  { slug: 'sauce-supplementaire', category: 'extras', group: 'Sauces', name: 'Sauce supplémentaire', description: 'Au choix, à préciser dans la note.', variants: single(250) },
];
