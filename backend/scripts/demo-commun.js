// Démonstration commerciale (base dev seulement) : marques « Démo », garde-fou du serveur et réglages de la
// démonstration. Sans accès à la base : testé dans test/demo.test.js. Scripts : demo-remplir.js, demo-effacer.js.
//
// Toutes les données de la démonstration sont reconnaissables, pour les effacer toutes, et seulement elles :
//   - commandes : référence « BC-0 » + 5 caractères (le chiffre 0 n'est jamais tiré pour une vraie référence,
//     src/utils/reference.js), client « … (Démo) » au téléphone de la plage +226 70 98 xx xx ;
//   - comptes de l'équipe : « … (Démo) », téléphone de la plage +226 70 97 0x xx ;
//   - provenances « Appel (Démo) » et « WhatsApp (Démo) » ;
//   - tournées et remises d'espèces : livreur et agent « … (Démo) » ;
//   - conditions du contrat : note « Démo, conditions fictives », ajoutées par « … (Démo) » ;
//   - quartiers de la grille des frais : noms de la liste DEMO_ZONES, rangés à partir de la place 900 (le nom
//     reste lisible pour la présentation, sans « (Démo) » sur chaque commande, bon et relevé) ;
//   - compte « Prestataire (Démo) » : créé par le client avec npm run equipe:prestataire, au numéro 70 97 00 50.

export const DEV_SERVER = 'ep-nameless-band-b4vetndd';
export const PROD_SERVER = 'ep-damp-lab-b44k8hrf';

// Nom du serveur seulement (« ep-nameless-band-b4vetndd »), jamais l'adresse ni le mot de passe.
// Neon ajoute « -pooler » au nom du serveur de la connexion partagée.
export function serverNameOf(url) {
  try {
    return new URL(url).hostname.split('.')[0].replace(/-pooler$/, '');
  } catch {
    return null;
  }
}

// null si la base est dev, sinon la raison du refus
export function serverError(urls) {
  const names = urls.map(serverNameOf);
  if (names.some((n) => n === PROD_SERVER)) return 'Base de PRODUCTION : la démonstration ne tourne jamais sur la production.';
  if (names.some((n) => n !== DEV_SERVER)) return 'Serveur inconnu : la démonstration ne tourne que sur la base dev.';
  return null;
}

export const DEMO = '(Démo)';
export const demoName = (name) => `${name} ${DEMO}`;
export const hasDemoName = (name) => typeof name === 'string' && name.endsWith(` ${DEMO}`);

export const DEMO_REF_PREFIX = 'BC-0';
export const DEMO_REF_RE = /^BC-0[A-Z0-9]{5}$/;
export const CUSTOMER_PHONE_PREFIX = '+2267098';
export const CUSTOMER_PHONE_RE = /^\+2267098\d{4}$/;
export const STAFF_PHONE_PREFIX = '+22670970';
export const STAFF_PHONE_RE = /^\+22670970\d{3}$/;

export const isDemoOrder = (o) =>
  DEMO_REF_RE.test(o.reference) && hasDemoName(o.customerName) && CUSTOMER_PHONE_RE.test(o.customerPhone);
export const isDemoStaff = (s) => STAFF_PHONE_RE.test(s.phone) && hasDemoName(s.name);
// Commande passée en direct sur le site local pendant les essais : référence normale, mais client « … (Démo) »
// au téléphone 70 98 xx xx (les deux marques exigées)
export const isLiveTestOrder = (o) =>
  /^BC-[A-Z0-9]{6}$/.test(o.reference) && !DEMO_REF_RE.test(o.reference) && hasDemoName(o.customerName) && CUSTOMER_PHONE_RE.test(o.customerPhone);
// Disponibilité d'un livreur « Démo » changée pendant les essais (par lui-même ou par un compte « Démo »)
export const isDemoAvailabilityChange = (c) => hasDemoName(c.courierName) && hasDemoName(c.byName);

// npm run demo:mot-de-passe : null si le mot de passe de ce compte peut être choisi, sinon la raison
export function passwordTargetError(user, phone) {
  if (!phone) return 'Numéro invalide. Exemple : 70 97 00 08.';
  if (!user) return 'Aucun compte n’a ce numéro.';
  if (!isDemoStaff(user)) return `${user.name} n’est pas un compte « Démo » : refusé.`;
  if (user.role === 'PRESTATAIRE') return 'Compte Prestataire : utilisez npm run equipe:prestataire, choix 3 (avec le code à 6 chiffres).';
  return null;
}
// Numéro réservé au compte « Prestataire (Démo) » (npm run equipe:prestataire, après le remplissage)
export const PRESTATAIRE_DEMO = { name: demoName('Prestataire'), phone: '70 97 00 50' };

export const DEMO_SOURCES = [
  { name: demoName('Appel'), kind: 'APPEL', phone: null },
  { name: demoName('WhatsApp'), kind: 'WHATSAPP', phone: '+22670970099' },
];
export const isDemoSource = (s) => DEMO_SOURCES.some((d) => d.name === s.name);
export const isDemoRun = (r) => hasDemoName(r.courierName) && hasDemoName(r.createdByName);
export const isDemoRemittance = (r) => hasDemoName(r.courierName) && hasDemoName(r.receivedByName);

// Conditions fictives du contrat (choix du client, 12 octobre 2026)
export const DEMO_TERMS_NOTE = 'Démo, conditions fictives';
export const DEMO_TERMS = { kind: 'PAR_LIVRAISON', perDeliveryPrice: 500, monthlyFee: null, freeDeliveryPrice: 300, note: DEMO_TERMS_NOTE };
export const isDemoTerms = (t) => t.note === DEMO_TERMS_NOTE && hasDemoName(t.createdByName);

// Société de livraison fictive : codes visiblement faux (seuls chiffres, * et # sont acceptés dans un code),
// « DÉMO » dans le nom de la société et dans le nom affiché au client
export const DEMO_COMPANY = {
  mode: 'PRESTATAIRE',
  companyName: 'Livraison DÉMO',
  merchantName: 'DÉMO – codes fictifs',
  orangeCode: '*000*01*00000000*MONTANT#',
  moovCode: '*000*02*00000000*MONTANT#',
  telecelCode: '*000*03*00000000*MONTANT#',
};

// Supplément de nuit sur dev pendant la démonstration : de 23 h à 6 h, donc seulement quand le restaurant
// est ouvert la nuit (vendredi et samedi 24 h/24, du dimanche au jeudi fermeture à 23 h)
export const DEMO_NIGHT = { nightEnabled: true, nightStartMin: 23 * 60, nightEndMin: 6 * 60 };
export const NIGHT_FEE = 500;

// Grille des frais de la démonstration : quartiers, frais (0 F = livraison offerte autour du restaurant),
// supplément de nuit, distance en km pour placer les clients. Rangés à partir de la place 900.
export const DEMO_ZONE_POSITION = 900;
export const DEMO_ZONES = [
  { name: 'Kamsonghin', fee: 0, km: [0.3, 1.2], w: 5 },
  { name: 'Samandin', fee: 500, km: [1, 3], w: 7 },
  { name: 'Gounghin', fee: 500, km: [1, 3], w: 8 },
  { name: 'Koulouba', fee: 500, km: [1, 3], w: 5 },
  { name: 'Paspanga', fee: 500, km: [1.5, 3], w: 4 },
  { name: 'Bilbalogo', fee: 500, km: [1, 2.5], w: 3 },
  { name: 'Dassasgho', fee: 1000, km: [3, 6], w: 7 },
  { name: 'Zogona', fee: 1000, km: [3, 5], w: 5 },
  { name: 'Wemtenga', fee: 1000, km: [3.5, 6], w: 6 },
  { name: 'Pissy', fee: 1000, km: [3, 6], w: 7 },
  { name: 'Tampouy', fee: 1000, km: [4, 6], w: 6 },
  { name: 'Cissin', fee: 1000, km: [3, 5.5], w: 6 },
  { name: 'Hamdalaye', fee: 1000, km: [3, 5], w: 4 },
  { name: 'Dapoya', fee: 1000, km: [3, 4.5], w: 4 },
  { name: 'Zone du Bois', fee: 1000, km: [3.5, 5.5], w: 4 },
  { name: 'Ouaga 2000', fee: 1500, km: [5, 9], w: 8 },
  { name: 'Patte d’Oie', fee: 1500, km: [5, 8], w: 5 },
  { name: 'Karpala', fee: 1500, km: [6, 9], w: 4 },
  { name: 'Tanghin', fee: 1500, km: [5, 8], w: 4 },
  { name: 'Somgandé', fee: 1500, km: [6, 9], w: 3 },
  { name: 'Kossodo', fee: 1500, km: [7, 10], w: 2 },
].map((z, i) => ({ ...z, nightFee: z.fee > 0 ? NIGHT_FEE : 0, position: 900 + i }));
export const isDemoZone = (z) => z.position >= DEMO_ZONE_POSITION && DEMO_ZONES.some((d) => d.name === z.name);

// Réglages photographiés en entier et remis exactement comme avant à l'effacement (même ligne, même date de
// mise à jour ; une ligne créée pendant la démonstration est supprimée). key : champ qui identifie la ligne.
export const RESTORED_TABLES = [
  { model: 'appSettings', key: 'id' },
  { model: 'deliverySettings', key: 'id' },
  { model: 'deliveryCompany', key: 'id' },
  { model: 'featureSwitch', key: 'key' },
  { model: 'deliveryZone', key: 'id' },
  { model: 'deliveryDistanceBand', key: 'id' },
];

// Colonnes ajoutées par une migration après la photo (ex. AppSettings.kioskMenu et newOrdersPage, lots 11 et 12) :
// à l'effacement, elles reprennent leur valeur par défaut (withAddedDefaults), puis la comparaison avec la photo
// ne regarde que les colonnes que la photo connaissait (photoColumns, projectRows), dans le même ordre.
// fields : champs du modèle Prisma (Prisma.dmmf), seules les valeurs par défaut simples (oui/non, nombre, texte).
export function withAddedDefaults(row, fields) {
  const out = { ...row };
  for (const f of fields) {
    if (f.kind !== 'scalar' || f.name in out || !f.hasDefaultValue) continue;
    if (f.default === null || typeof f.default === 'object') continue; // now(), cuid()… : jamais pour ces colonnes
    out[f.name] = f.default;
  }
  return out;
}

// { appSettings: ['id', 'shortFlow', …] } : colonnes de chaque table de réglages au moment de la photo
export function photoColumns(photo) {
  const out = {};
  for (const { model } of RESTORED_TABLES) {
    const rows = photo.settings?.[model];
    if (rows?.length) out[model] = Object.keys(rows[0]);
  }
  return out;
}

export const projectRows = (rows, keys) => rows.map((r) => Object.fromEntries(keys.map((k) => [k, r[k]])));

// Interrupteurs ouverts pendant la démonstration (remis comme avant à l'effacement)
export const DEMO_FEATURES = ['TABLEAU_DE_BORD', 'CAISSE', 'VENTES', 'AVIS', 'RELEVE'];

// Photo de dev avant la démonstration : hors du projet (jamais sur GitHub), sans mot de passe ni adresse
export const PHOTO_DIR = 'C:\\Users\\HP\\Desktop\\belchiken\\demo-photo-avant';
export const PHOTO_FILE = 'photo.json';

// Comparaison de deux photos (avant / après) : liste des tables qui diffèrent.
// SecurityLog : la base refuse d'effacer ses lignes ; seules de nouvelles lignes sont admises (connexions
// pendant la présentation), les anciennes doivent être identiques (hash des lignes d'avant la photo).
export function comparePhotos(before, after) {
  const diffs = [];
  const names = new Set([...Object.keys(before.tables), ...Object.keys(after.tables)]);
  for (const name of [...names].sort()) {
    const b = before.tables[name];
    const a = after.tables[name];
    if (!b || !a) {
      diffs.push({ table: name, text: 'table absente d’une des deux photos' });
      continue;
    }
    if (name === 'SecurityLog') {
      if (a.hashUntilPhoto !== b.hash) diffs.push({ table: name, text: 'des lignes d’avant la photo ont changé' });
      else if (a.count !== b.count) diffs.push({ table: name, text: `${a.count - b.count} ligne(s) ajoutée(s) depuis la photo (la base refuse de les effacer)`, allowed: true });
      continue;
    }
    if (a.count !== b.count) diffs.push({ table: name, text: `${b.count} ligne(s) avant, ${a.count} après` });
    else if (a.hash !== b.hash) diffs.push({ table: name, text: 'même nombre de lignes, contenu différent' });
  }
  return diffs;
}
