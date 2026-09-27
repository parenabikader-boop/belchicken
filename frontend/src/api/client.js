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

async function request(path, options = {}) {
  let res;
  try {
    res = await fetch(BASE + path, {
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
  createOrder: (payload) => request('/api/orders', { method: 'POST', body: JSON.stringify(payload) }).then((d) => d.order),
  getOrder: (reference) => request(`/api/orders/${encodeURIComponent(reference)}`).then((d) => d.order),
};
