// Couleur de fond de chaque photo (reprise de la maquette), pour éviter un blanc pendant le chargement
// et remplir l'espace autour des visuels larges.
export const PHOTO_BG = {
  grill: '#ef7a08', rice_belgrill: '#d85d55', wrap_fried: '#fe9300', special: '#dd7b5e', choice: '#dc1f25',
  wrap_kebab: '#fd9400', rice_belicious: '#c01f0b', extreme: '#e86b01', beignets: '#d65120', friends: '#f61800',
  fries: '#cd3316', xl: '#f08f36', smoky: '#f88e01', family: '#d74c1a', wings: '#ef7901', wrap_fuego: '#f89307',
  finest: '#e87609', salad_chicken: '#097e11', salad_kebab: '#2e8226', fuego: '#d56d15', boneless: '#e94b3d',
  pieces: '#fa8f04', chefs: '#e8562e', wings12: '#e77204', kids: '#aa2da9', rice_bowl: '#c51200', alloco: '#992a14',
  bucket2: '#6a453a', magnifique: '#f4615f', popcorn: '#d56154', tenders: '#f4d199',
};

// Visuels au format paysage, affichés en entier plutôt que recadrés
const WIDE = ['chefs', 'boneless', 'choice', 'xl', 'special', 'fuego', 'pieces', 'rice_belicious'];

// "/menu/finest.jpg" -> "finest"
export const photoKey = (url) => (url ? url.split('/').pop().replace(/\.\w+$/, '') : null);
export const photoBg = (url) => PHOTO_BG[photoKey(url)] || 'var(--panel-2)';
export const isWide = (url) => WIDE.includes(photoKey(url));

// Forme des cartes selon le type de plat (voir ProductCard)
const CATEGORY_LAYOUT = {
  burgers: 'big', wraps: 'big', salades: 'big',
  combos: 'wide', buckets: 'wide', 'rice-box': 'wide', 'bel-kids': 'wide',
  extras: 'row',
};
export const cardLayout = (slug) => CATEGORY_LAYOUT[slug] || 'std';

// Bandeau de chaque catégorie : petit titre repris du menu papier et photo du plat vedette
const CATEGORY_BANNER = {
  burgers: { script: 'Originals & XL', photo: 'finest' },
  poulet: { script: 'Chicken Deals', photo: 'wings12' },
  combos: { script: 'Le choix du chef', photo: 'chefs' },
  buckets: { script: 'À partager', photo: 'family' },
  wraps: { script: 'Wraps', photo: 'wrap_fuego' },
  'rice-box': { script: 'Rice Box', photo: 'rice_belgrill' },
  salades: { script: '100 % Fresh', photo: 'salad_chicken' },
  'bel-kids': { script: 'Pour les petits', photo: 'kids' },
  // small : photo de petite taille, affichée sans être agrandie pour rester nette
  extras: { script: 'Pour compléter', photo: 'beignets', small: true },
};
export const categoryBanner = (slug) => {
  const b = CATEGORY_BANNER[slug];
  return b ? { ...b, photo: `/menu/${b.photo}.jpg` } : null;
};
