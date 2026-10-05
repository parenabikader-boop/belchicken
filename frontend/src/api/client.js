// Client de l'API Belchicken. Les messages d'erreur du serveur sont déjà en français
// et sont affichés tels quels.
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
  getOrder: (reference) => request(`/api/orders/${encodeURIComponent(reference)}`).then((d) => d.order),
};

// Espace équipe : appels sur la même adresse que le site (/api/staff/...), relayés vers l'API
// par Vite en local (vite.config.js) et par Vercel en ligne (vercel.json). Le cookie de session
// reste ainsi un cookie « du site », que Safari ne bloque pas.
const staffRequest = (path, options) => request('/api/staff' + path, { credentials: 'same-origin', ...options }, '');

export const staffApi = {
  me: () => staffRequest('/me').then((d) => d.user),
  login: (phone, password) => staffRequest('/login', { method: 'POST', body: JSON.stringify({ phone, password }) }).then((d) => d.user),
  logout: () => staffRequest('/logout', { method: 'POST' }),
  orders: ({ status, q } = {}) => {
    const params = new URLSearchParams();
    if (status) params.set('status', status);
    if (q) params.set('q', q);
    return staffRequest(`/orders?${params}`);
  },
  order: (reference) => staffRequest(`/orders/${encodeURIComponent(reference)}`).then((d) => d.order),
  setStatus: (reference, body) =>
    staffRequest(`/orders/${encodeURIComponent(reference)}/status`, { method: 'POST', body: JSON.stringify(body) }).then((d) => d.order),
  // Frais de livraison (montant en F) et « Frais reçus »
  setDeliveryFee: (reference, amount) =>
    staffRequest(`/orders/${encodeURIComponent(reference)}/delivery-fee`, { method: 'PUT', body: JSON.stringify({ amount }) }).then((d) => d.order),
  setFeeReceived: (reference, received) =>
    staffRequest(`/orders/${encodeURIComponent(reference)}/delivery-fee/received`, { method: 'POST', body: JSON.stringify({ received }) }).then((d) => d.order),
  // Message WhatsApp ouvert par l'agent : noté dans l'historique. keepalive : la requête part même
  // si le téléphone bascule aussitôt sur WhatsApp.
  // Client prévenu de l'étape en cours : by = 'WHATSAPP' (message envoyé) ou 'APPEL'
  confirmNotice: (reference, key, by) =>
    staffRequest(`/orders/${encodeURIComponent(reference)}/notice`, { method: 'POST', body: JSON.stringify({ key, by }) }).then((d) => d.order),
  logMessage: (reference, key) =>
    staffRequest(`/orders/${encodeURIComponent(reference)}/messages`, { method: 'POST', body: JSON.stringify({ key }), keepalive: true }),

  // Livreurs : liste pour le départ d'une commande, remplacement pendant la livraison
  couriers: () => staffRequest('/orders/livreurs').then((d) => d.couriers),
  reassignCourier: (reference, courierId) =>
    staffRequest(`/orders/${encodeURIComponent(reference)}/courier`, { method: 'PUT', body: JSON.stringify({ courierId }) }).then((d) => d.order),

  // Espace livreur : ses courses du jour, et la remise avec le code du client
  courses: () => staffRequest('/courses'),
  deliver: (reference, code) =>
    staffRequest(`/courses/${encodeURIComponent(reference)}/deliver`, { method: 'POST', body: JSON.stringify({ code }) }).then((d) => d.course),

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
