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

// Photos Cloudinary : taille et format choisis à la demande (WebP/AVIF selon le navigateur, qualité automatique).
// Les photos d'origine (/menu/…, /accueil/…) sont servies telles quelles.
export const photoUrl = (url, width) =>
  url && url.includes('res.cloudinary.com/') && url.includes('/upload/')
    ? url.replace('/upload/', `/upload/f_auto,q_auto,c_limit,w_${width}/`)
    : url;

// Attributs <img> en plusieurs tailles : le navigateur choisit selon l'écran (petite photo sur téléphone).
// widths : tailles proposées en px ; sizes : largeur affichée (syntaxe HTML « sizes »).
const isCloudinary = (url) => url && url.includes('res.cloudinary.com/') && url.includes('/upload/');
export const photoProps = (url, widths, sizes) =>
  isCloudinary(url)
    ? { src: photoUrl(url, widths[widths.length - 1]), srcSet: widths.map((w) => `${photoUrl(url, w)} ${w}w`).join(', '), sizes }
    : { src: url };

// Tailles du site public
export const PHOTO_SIZES = {
  card: [[320, 480, 720, 960], '(max-width: 640px) 92vw, (max-width: 1100px) 45vw, 300px'],
  row: [[160, 320], '110px'],
  dialog: [[480, 720, 960, 1200], '(max-width: 760px) 100vw, 450px'],
  banner: [[400, 700, 1000, 1300], '(max-width: 640px) 50vw, 46vw'],
  thumb: [[160], '80px'],
};
export const sizedPhoto = (url, kind) => photoProps(url, ...PHOTO_SIZES[kind]);

// "/menu/finest.jpg" -> "finest"
export const photoKey = (url) => (url ? url.split('/').pop().replace(/\.\w+$/, '') : null);
export const photoBg = (url) => PHOTO_BG[photoKey(url)] || 'var(--panel-2)';
export const isWide = (url) => WIDE.includes(photoKey(url));

// Forme des cartes selon le type de plat (voir ProductCard)
const CATEGORY_LAYOUT = {
  burgers: 'big', wraps: 'big', salades: 'big',
  combos: 'wide', buckets: 'wide', 'rice-box': 'wide', 'bel-kids': 'wide',
  extras: 'row', boissons: 'row',
};
export const cardLayout = (slug) => CATEGORY_LAYOUT[slug] || 'std';

// Bandeau de chaque catégorie : petit titre et photo vedette, gérés en base depuis l'espace équipe.
// Photos d'origine de petite taille, affichées sans être agrandies pour rester nettes
const SMALL = ['beignets'];
export const categoryBanner = (c) =>
  c.script || c.heroImageUrl
    ? { script: c.script, photo: c.heroImageUrl, small: SMALL.includes(photoKey(c.heroImageUrl)) }
    : null;
