// Client de l'API Belchicken. Les messages d'erreur du serveur sont déjà en français
// et sont affichés tels quels ; en anglais (lot 8), le site les traduit d'après leur code (i18n/en.js).
const BASE = (import.meta.env.VITE_API_URL || 'http://localhost:3006').replace(/\/+$/, '');

export class ApiError extends Error {
  constructor(message, { status = 0, code = 'ERREUR_RESEAU', details } = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

async function request(path, options = {}, base = BASE) {
  let res;
  try {
    res = await fetch(base + path, {
      ...options,
      headers: { Accept: 'application/json', ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers },
    });
  } catch {
    throw new ApiError('Connexion impossible. Vérifiez votre connexion internet puis réessayez.');
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const e = data?.error;
    throw new ApiError(e?.message || 'Une erreur est survenue. Réessayez dans un instant.', {
      status: res.status,
      code: e?.code,
      details: e?.details,
    });
  }
  return data;
}

export const api = {
  getMenu: () => request('/api/menu').then((d) => d.categories),
  getHomePhotos: () => request('/api/home').then((d) => d.photos),
  createOrder: (payload) => request('/api/orders', { method: 'POST', body: JSON.stringify(payload) }).then((d) => d.order),
  // Plan 4 : key = clé du lien de suivi (envoyée dans un en-tête, jamais dans l'adresse) ; sans clé : comme avant
  getOrder: (reference, key = null) =>
    request(`/api/orders/${encodeURIComponent(reference)}`, key ? { headers: { 'X-Suivi-Cle': key } } : {}).then((d) => d.order),
  // Plan 4 : alertes de cette commande sur ce téléphone (subscription : PushSubscription.toJSON())
  subscribeOrderAlerts: (reference, key, subscription) =>
    request(`/api/orders/${encodeURIComponent(reference)}/alertes`, { method: 'POST', body: JSON.stringify({ cle: key, subscription }) }),
  // Codes marchands des 3 opérateurs, avec MONTANT à remplacer : { merchantName, operators: [{ method, label, code }] }
  getPayment: () => request('/api/payment'),
  // Grille des frais de livraison : { active, zones: [{ id, name, fee }], gps, allowOther }
  getDelivery: () => request('/api/delivery'),
  // Frais pour un choix ({ zoneId } | { other: true } | { location }) : { source, fee, zoneName, distanceKm }
  quoteDelivery: (choice) => request('/api/delivery/quote', { method: 'POST', body: JSON.stringify(choice) }).then((d) => d.quote),
  // Lot 7 : avis du client, par la clé du lien du remerciement : { reference, firstName, delivery, state }
  getReview: (token) => request(`/api/avis/${encodeURIComponent(token)}`).then((d) => d.review),
  sendReview: (token, body) => request(`/api/avis/${encodeURIComponent(token)}`, { method: 'POST', body: JSON.stringify(body) }).then((d) => d.review),
  // Lot 8 : { anglais } = bouton FR / EN affiché (réglage du Patron « Site en anglais »)
  getSite: () => request('/api/site'),
};

// Espace équipe : appels sur la même adresse que le site (/api/staff/...), relayés vers l'API
// par Vite en local (vite.config.js) et par Vercel en ligne (vercel.json). Le cookie de session
// reste ainsi un cookie « du site », que Safari ne bloque pas.
const staffRequest = (path, options) => request('/api/staff' + path, { credentials: 'same-origin', ...options }, '');

// Fichier à télécharger (Excel du relevé, lot 5d) : enregistré sous `name`, ou erreur lisible du serveur
async function downloadFile(path, name) {
  let res;
  try {
    res = await fetch(path, { credentials: 'same-origin' });
  } catch {
    throw new ApiError('Connexion impossible. Vérifiez votre connexion internet puis réessayez.');
  }
  if (!res.ok) {
    const e = (await res.json().catch(() => null))?.error;
    throw new ApiError(e?.message || 'Le fichier n’a pas pu être préparé. Réessayez dans un instant.', { status: res.status, code: e?.code });
  }
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

export const staffApi = {
  // { user, features } : features = fonctions ouvertes par le Prestataire (lot 4)
  me: () => staffRequest('/me'),
  // { user } ou, pour le compte Prestataire, { codeRequired: true } (lot 4)
  login: (phone, password) => staffRequest('/login', { method: 'POST', body: JSON.stringify({ phone, password }) }),
  loginCode: (code) => staffRequest('/login/code', { method: 'POST', body: JSON.stringify({ code }) }).then((d) => d.user),
  // Page Prestataire (lot 4) : interrupteurs des fonctions et journal de sécurité
  features: () => staffRequest('/prestataire/fonctions').then((d) => d.features),
  setFeature: (key, enabled) => staffRequest(`/prestataire/fonctions/${key}`, { method: 'PUT', body: JSON.stringify({ enabled }) }).then((d) => d.features),
  securityLog: (page = 1) => staffRequest(`/prestataire/journal?page=${page}`),
  // Lot 5 : mode de livraison, notre société et nos codes marchands (Prestataire)
  deliveryCompany: () => staffRequest('/prestataire/livraison'),
  setDeliveryCompany: (body) => staffRequest('/prestataire/livraison', { method: 'PUT', body: JSON.stringify(body) }),
  // Plan 2 : paiements reçus automatiquement (journal, formats des SMS) et « Tester un SMS » (sans rien enregistrer)
  autoPayments: () => staffRequest('/prestataire/paiements-auto'),
  testPaymentSms: (sender, text) => staffRequest('/prestataire/paiements-auto/test', { method: 'POST', body: JSON.stringify({ sender, text }) }).then((d) => d.result),
  logout: () => staffRequest('/logout', { method: 'POST' }),
  // Lot 5b : page Livraison (Responsable livraison et Prestataire) : nos livreurs, nos courses, notre caisse
  deliveryOverview: () => staffRequest('/livraison'),
  setDeliveryAvailability: (id, availability) =>
    staffRequest(`/livraison/livreurs/${id}/disponibilite`, { method: 'PUT', body: JSON.stringify({ availability }) }),
  deliveryTeam: () => staffRequest('/livraison/equipe').then((d) => d.members),
  createDeliveryMember: (body) => staffRequest('/livraison/equipe', { method: 'POST', body: JSON.stringify(body) }).then((d) => d.member),
  resetDeliveryMember: (id, password) =>
    staffRequest(`/livraison/equipe/${id}/password`, { method: 'POST', body: JSON.stringify({ password }) }).then((d) => d.member),
  deactivateDeliveryMember: (id) => staffRequest(`/livraison/equipe/${id}/deactivate`, { method: 'POST' }).then((d) => d.member),
  reactivateDeliveryMember: (id, password) =>
    staffRequest(`/livraison/equipe/${id}/reactivate`, { method: 'POST', body: JSON.stringify({ password }) }).then((d) => d.member),
  // Lot 5c : livreur des commandes de notre partenaire (seul ou en tournée), retrait, récupération avec un motif
  assignDeliveryRun: (courierId, references) => staffRequest('/livraison/tournees', { method: 'POST', body: JSON.stringify({ courierId, references }) }),
  setDeliveryCourier: (reference, courierId) =>
    staffRequest(`/livraison/courses/${encodeURIComponent(reference)}/livreur`, { method: 'PUT', body: JSON.stringify({ courierId }) }),
  removeDeliveryCourier: (reference) => staffRequest(`/livraison/courses/${encodeURIComponent(reference)}/livreur`, { method: 'DELETE' }),
  deliveryPickUp: (reference, reason) =>
    staffRequest(`/livraison/courses/${encodeURIComponent(reference)}/recuperee`, { method: 'POST', body: JSON.stringify({ reason }) }),
  deliveryCash: () => staffRequest('/livraison/caisse'),
  remitDeliveryCash: (courierId, references) =>
    staffRequest('/livraison/caisse/remises', { method: 'POST', body: JSON.stringify({ courierId, references }) }),
  verifyDeliveryFee: (reference, verified) =>
    staffRequest(`/livraison/caisse/${encodeURIComponent(reference)}/verifie`, { method: 'POST', body: JSON.stringify({ verified }) }),
  // Lot 5d : relevé de livraison (du, au : 'AAAA-MM-JJ'). Sans conditions ni montant dû pour le Responsable
  // livraison (retirés par le serveur). Conditions du contrat : lues par le Prestataire et le Patron.
  statement: (du, au) => staffRequest(`/releve?${new URLSearchParams({ du, au })}`).then((d) => d.statement),
  statementExcel: (du, au) => downloadFile(`/api/staff/releve/excel?${new URLSearchParams({ du, au })}`, `releve-livraison-${du}-au-${au}.xlsx`),
  contractTerms: () => staffRequest('/releve/conditions'),
  // Lot 6 : ventes par période (du, au : 'AAAA-MM-JJ'), Patron et Prestataire
  sales: (du, au) => staffRequest(`/ventes?${new URLSearchParams({ du, au })}`).then((d) => d.sales),
  // Lot 7 : avis des clients (Patron et Prestataire), notes de livraison de notre équipe (page Livraison)
  reviews: (du, au) => staffRequest(`/avis?${new URLSearchParams({ du, au })}`).then((d) => d.reviews),
  orderReview: (reference) => staffRequest(`/avis/commande/${encodeURIComponent(reference)}`).then((d) => d.review),
  callBack: (id, note) => staffRequest(`/avis/${encodeURIComponent(id)}/rappel`, { method: 'POST', body: JSON.stringify({ note }) }).then((d) => d.review),
  partnerReviews: (du, au) => staffRequest(`/livraison/avis?${new URLSearchParams({ du, au })}`).then((d) => d.reviews),
  salesExcel: (du, au) => downloadFile(`/api/staff/ventes/excel?${new URLSearchParams({ du, au })}`, `ventes-${du}-au-${au}.xlsx`),
  createContractTerms: (body) => staffRequest('/releve/conditions', { method: 'POST', body: JSON.stringify(body) }),
  deleteContractTerms: (id) => staffRequest(`/releve/conditions/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  orders: ({ status, q } = {}) => {
    const params = new URLSearchParams();
    if (status) params.set('status', status);
    if (q) params.set('q', q);
    return staffRequest(`/orders?${params}`);
  },
  order: (reference) => staffRequest(`/orders/${encodeURIComponent(reference)}`).then((d) => d.order),
  setStatus: (reference, body) =>
    staffRequest(`/orders/${encodeURIComponent(reference)}/status`, { method: 'POST', body: JSON.stringify(body) }).then((d) => d.order),
  // Frais de livraison (montant en F) : saisie, ou correction avec un motif (Patron seul après le départ du livreur)
  // nightFee (lot 3) : « dont supplément de nuit » (null = aucun ; absent = gardé)
  setDeliveryFee: (reference, amount, reason, nightFee) =>
    staffRequest(`/orders/${encodeURIComponent(reference)}/delivery-fee`, { method: 'PUT', body: JSON.stringify({ amount, reason, nightFee }) }).then((d) => d.order),
  // Frais payés par mobile money : vérifiés (ou non) sur le téléphone marchand
  setFeeVerified: (reference, verified) =>
    staffRequest(`/orders/${encodeURIComponent(reference)}/delivery-fee/verified`, { method: 'POST', body: JSON.stringify({ verified }) }).then((d) => d.order),

  // Réglages du logiciel (parcours court…) : lus par l'équipe, changés par le Patron
  settings: () => staffRequest('/reglages').then((d) => d.settings),
  setSettings: (body) => staffRequest('/reglages', { method: 'PUT', body: JSON.stringify(body) }).then((d) => d.settings),
  // Prise de commande par l'agent (lot 2) : réglage et provenances proposées (jamais « Site »), client
  // retrouvé par son numéro, commande saisie
  agentContext: () => staffRequest('/orders/nouvelle'),
  findCustomer: (phone) => staffRequest(`/orders/client?phone=${encodeURIComponent(phone)}`).then((d) => d.customer),
  createAgentOrder: (payload) => staffRequest('/orders', { method: 'POST', body: JSON.stringify(payload) }).then((d) => d.order),
  // Provenances des commandes (Patron) : chaque appel renvoie la liste à jour
  sources: () => staffRequest('/provenances').then((d) => d.sources),
  createSource: (body) => staffRequest('/provenances', { method: 'POST', body: JSON.stringify(body) }).then((d) => d.sources),
  updateSource: (id, body) => staffRequest(`/provenances/${id}`, { method: 'PUT', body: JSON.stringify(body) }).then((d) => d.sources),
  setSourceActive: (id, isActive) =>
    staffRequest(`/provenances/${id}/active`, { method: 'PATCH', body: JSON.stringify({ isActive }) }).then((d) => d.sources),
  reorderSources: (ids) => staffRequest('/provenances/order', { method: 'PUT', body: JSON.stringify({ ids }) }).then((d) => d.sources),
  deleteSource: (id) => staffRequest(`/provenances/${id}`, { method: 'DELETE' }).then((d) => d.sources),
  // Grille des frais de livraison (Patron) : chaque appel renvoie la grille à jour
  deliveryFees: () => staffRequest('/frais-livraison'),
  createDeliveryZone: (body) => staffRequest('/frais-livraison/zones', { method: 'POST', body: JSON.stringify(body) }),
  updateDeliveryZone: (id, body) => staffRequest(`/frais-livraison/zones/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  reorderDeliveryZones: (ids) => staffRequest('/frais-livraison/zones/order', { method: 'PUT', body: JSON.stringify({ ids }) }),
  createDeliveryBand: (body) => staffRequest('/frais-livraison/bands', { method: 'POST', body: JSON.stringify(body) }),
  updateDeliveryBand: (id, body) => staffRequest(`/frais-livraison/bands/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteDeliveryBand: (id) => staffRequest(`/frais-livraison/bands/${id}`, { method: 'DELETE' }),
  setDeliverySettings: (body) => staffRequest('/frais-livraison/settings', { method: 'PUT', body: JSON.stringify(body) }),
  // Plan 3 : grille par kilomètre (interrupteur FRAIS_PAR_KM ouvert)
  setDeliveryKmGrid: (body) => staffRequest('/frais-livraison/km', { method: 'PUT', body: JSON.stringify(body) }),

  // Caisse : frais à vérifier, espèces chez les livreurs, remises
  cash: () => staffRequest('/caisse'),
  remitCash: (courierId, references) => staffRequest('/caisse/remises', { method: 'POST', body: JSON.stringify({ courierId, references }) }),
  // Message WhatsApp ouvert par l'agent : noté dans l'historique. keepalive : la requête part même
  // si le téléphone bascule aussitôt sur WhatsApp.
  // Client prévenu de l'étape en cours : by = 'WHATSAPP' (message envoyé) ou 'APPEL'
  confirmNotice: (reference, key, by) =>
    staffRequest(`/orders/${encodeURIComponent(reference)}/notice`, { method: 'POST', body: JSON.stringify({ key, by }) }).then((d) => d.order),
  logMessage: (reference, key) =>
    staffRequest(`/orders/${encodeURIComponent(reference)}/messages`, { method: 'POST', body: JSON.stringify({ key }), keepalive: true }),

  // Livreurs : liste pour le départ d'une commande, remplacement pendant la livraison
  // Lot 5b : livreurs de l'équipe du mode de la commande, avec leur état (si la disponibilité est active)
  couriers: (reference) => staffRequest(`/orders/livreurs${reference ? `?reference=${encodeURIComponent(reference)}` : ''}`),
  setRestaurantAvailability: (id, availability) =>
    staffRequest(`/orders/livreurs/${id}/disponibilite`, { method: 'PUT', body: JSON.stringify({ availability }) }),
  reassignCourier: (reference, courierId) =>
    staffRequest(`/orders/${encodeURIComponent(reference)}/courier`, { method: 'PUT', body: JSON.stringify({ courierId }) }).then((d) => d.order),
  // Lot 5c : tournée des livreurs du restaurant (orders : [{ reference, from }]), et commande de notre partenaire
  // récupérée sans que son livreur ait pu appuyer (motif obligatoire)
  restaurantTour: (courierId, orders) => staffRequest('/orders/tournee', { method: 'POST', body: JSON.stringify({ courierId, orders }) }),
  pickUpForCourier: (reference, reason) =>
    staffRequest(`/orders/${encodeURIComponent(reference)}/recuperee`, { method: 'POST', body: JSON.stringify({ reason }) }).then((d) => d.order),

  // Espace livreur : ses courses du jour, et la remise avec le code du client
  courses: () => staffRequest('/courses'),
  setMyAvailability: (availability) => staffRequest('/courses/disponibilite', { method: 'PUT', body: JSON.stringify({ availability }) }).then((d) => d.availability),
  // Lot 5c : « Commande récupérée » (commande de notre partenaire, prête au restaurant)
  pickUp: (reference) => staffRequest(`/courses/${encodeURIComponent(reference)}/recuperee`, { method: 'POST' }).then((d) => d.course),
  // feeMethod : comment le client a payé les frais (ESPECES ou MOBILE_MONEY)
  deliver: (reference, code, feeMethod) =>
    staffRequest(`/courses/${encodeURIComponent(reference)}/deliver`, { method: 'POST', body: JSON.stringify({ code, feeMethod }) }).then((d) => d.course),
  // Plan 1 (call center allégé) : client sans son code, le livreur valide avec un motif obligatoire
  deliverWithoutCode: (reference, reason, feeMethod) =>
    staffRequest(`/courses/${encodeURIComponent(reference)}/sans-code`, { method: 'POST', body: JSON.stringify({ reason, feeMethod }) }).then((d) => d.course),

  // Menu : disponibilité pour toute l'équipe, le reste pour le Patron (vérifié par l'API)
  menu: () => staffRequest('/menu'),
  setAvailability: (id, isAvailable) =>
    staffRequest(`/menu/products/${id}/availability`, { method: 'PATCH', body: JSON.stringify({ isAvailable }) }).then((d) => d.product),
  createProduct: (body) => staffRequest('/menu/products', { method: 'POST', body: JSON.stringify(body) }).then((d) => d.product),
  updateProduct: (id, body) => staffRequest(`/menu/products/${id}`, { method: 'PUT', body: JSON.stringify(body) }).then((d) => d.product),
  deleteProduct: (id) => staffRequest(`/menu/products/${id}`, { method: 'DELETE' }),
  restoreProduct: (id) => staffRequest(`/menu/products/${id}/restore`, { method: 'POST' }).then((d) => d.product),
  reorderProducts: (categoryId, ids) =>
    staffRequest(`/menu/categories/${categoryId}/products/order`, { method: 'PUT', body: JSON.stringify({ ids }) }),
  createCategory: (body) => staffRequest('/menu/categories', { method: 'POST', body: JSON.stringify(body) }).then((d) => d.id),
  updateCategory: (id, body) => staffRequest(`/menu/categories/${id}`, { method: 'PUT', body: JSON.stringify(body) }).then((d) => d.id),
  deleteCategory: (id) => staffRequest(`/menu/categories/${id}`, { method: 'DELETE' }),
  reorderCategories: (ids) => staffRequest('/menu/categories/order', { method: 'PUT', body: JSON.stringify({ ids }) }),
  // Photos : le fichier (déjà réduit en JPEG par PhotoPicker) est envoyé tel quel
  setProductPhoto: (id, blob) =>
    staffRequest(`/menu/products/${id}/photo`, { method: 'PUT', body: blob, headers: { 'Content-Type': blob.type || 'image/jpeg' } }).then((d) => d.product),
  removeProductPhoto: (id) => staffRequest(`/menu/products/${id}/photo`, { method: 'DELETE' }).then((d) => d.product),
  setCategoryPhoto: (id, blob) =>
    staffRequest(`/menu/categories/${id}/photo`, { method: 'PUT', body: blob, headers: { 'Content-Type': blob.type || 'image/jpeg' } }).then((d) => d.category),
  removeCategoryPhoto: (id) => staffRequest(`/menu/categories/${id}/photo`, { method: 'DELETE' }).then((d) => d.category),
  // Photos de l'accueil (cases 1 à 3) ; retirer = remettre la photo d'origine
  getHomePhotos: () => staffRequest('/home').then((d) => d.photos),
  setHomePhoto: (slot, blob) =>
    staffRequest(`/home/${slot}/photo`, { method: 'PUT', body: blob, headers: { 'Content-Type': blob.type || 'image/jpeg' } }).then((d) => d.photo),
  // Tableau de bord (Patron) : period = day | week | month, offset = 0 (en cours), -1 (précédente)…
  getDashboard: (period, offset) => staffRequest(`/dashboard?period=${period}&offset=${offset}`),
  // Nouvelle présentation du tableau de bord : bloc « Aujourd'hui » (lecture seule)
  getDashboardToday: () => staffRequest('/dashboard/aujourdhui'),
  resetHomePhoto: (slot) => staffRequest(`/home/${slot}/photo`, { method: 'DELETE' }).then((d) => d.photo),
  // Alertes de nouvelle commande sur téléphone (Patron et Opérateur)
  pushStatus: () => staffRequest('/push'),
  pushSubscribe: (subscription) => staffRequest('/push/subscribe', { method: 'POST', body: JSON.stringify(subscription) }),
  pushUnsubscribe: (endpoint) => staffRequest('/push/unsubscribe', { method: 'POST', body: JSON.stringify({ endpoint }) }),
  pushTest: (endpoint) => staffRequest('/push/test', { method: 'POST', body: JSON.stringify({ endpoint }) }),
  // Son propre mot de passe (tout membre). currentPassword est inutile quand il est provisoire.
  changePassword: (body) => staffRequest('/password', { method: 'POST', body: JSON.stringify(body) }).then((d) => d.user),
  // Page Équipe (Patron) : comptes Opérateur
  team: () => staffRequest('/team').then((d) => d.members),
  createMember: (body) => staffRequest('/team', { method: 'POST', body: JSON.stringify(body) }).then((d) => d.member),
  resetMemberPassword: (id, password) =>
    staffRequest(`/team/${id}/password`, { method: 'POST', body: JSON.stringify({ password }) }).then((d) => d.member),
  deactivateMember: (id) => staffRequest(`/team/${id}/deactivate`, { method: 'POST' }).then((d) => d.member),
  reactivateMember: (id, password) =>
    staffRequest(`/team/${id}/reactivate`, { method: 'POST', body: JSON.stringify({ password }) }).then((d) => d.member),
};
