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
  resetHomePhoto: (slot) => staffRequest(`/home/${slot}/photo`, { method: 'DELETE' }).then((d) => d.photo),
};
