// Service worker Belchicken (site client et espace équipe).
//
// Il garde en mémoire sur le téléphone ce qui ne change pas souvent, pour que le site
// s'ouvre plus vite : code du site (/assets), photos, icônes, polices.
//
// Il ne garde JAMAIS les données : menu et prix, commandes, espace équipe (/api/...).
// Ces requêtes ne sont pas du tout touchées par ce fichier : elles partent toujours
// sur internet, comme sans service worker. Les pages elles-mêmes ne sont pas gardées
// non plus : sans connexion, le téléphone affiche la page « Pas de connexion ».
//
// Changer VERSION efface les anciennes copies à la prochaine visite.
const VERSION = 'v1';
const SHELL = `bc-shell-${VERSION}`; // page « Pas de connexion » et ses icônes
const ASSETS = `bc-assets-${VERSION}`; // code du site (noms uniques à chaque mise en ligne)
const IMAGES = `bc-images-${VERSION}`; // photos et icônes
const FONTS = `bc-fonts-${VERSION}`; // polices Google
const KEEP = [SHELL, ASSETS, IMAGES, FONTS];

const OFFLINE_URL = '/hors-ligne.html';
const SHELL_FILES = [OFFLINE_URL, '/icons/client-192.png', '/icons/equipe-192.png'];

const MAX_IMAGES = 150;
const MAX_ASSETS = 80;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then((cache) => cache.addAll(SHELL_FILES))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('bc-') && !KEEP.includes(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  // Données : jamais de copie, on laisse passer sans rien faire
  if (url.pathname.startsWith('/api/') || url.pathname.includes('/api/')) return;

  // Pages du site : toujours sur internet ; sans connexion, page « Pas de connexion »
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(() => caches.match(OFFLINE_URL, { cacheName: SHELL })));
    return;
  }

  const sameOrigin = url.origin === self.location.origin;

  // Code du site : chaque mise en ligne crée des fichiers aux noms nouveaux, la copie reste valable
  if (sameOrigin && url.pathname.startsWith('/assets/')) {
    event.respondWith(cacheFirst(request, ASSETS, MAX_ASSETS));
    return;
  }

  // Photos et icônes du site : copie affichée tout de suite, mise à jour en arrière-plan
  if (sameOrigin && /^\/(menu|accueil|brand|icons)\//.test(url.pathname)) {
    event.respondWith(staleWhileRevalidate(request, IMAGES, MAX_IMAGES));
    return;
  }

  // Photos envoyées par l'équipe (Cloudinary) : une nouvelle photo a toujours une nouvelle adresse
  if (url.hostname === 'res.cloudinary.com' && request.destination === 'image') {
    event.respondWith(cacheFirst(request, IMAGES, MAX_IMAGES));
    return;
  }

  // Polices
  if (url.hostname === 'fonts.gstatic.com') {
    event.respondWith(cacheFirst(request, FONTS, 30));
    return;
  }
  if (url.hostname === 'fonts.googleapis.com') {
    event.respondWith(staleWhileRevalidate(request, FONTS, 30));
  }

  // Tout le reste : comportement normal du navigateur
});

// Une réponse correcte, ou une photo d'un autre site (illisible mais affichable)
const storable = (res) => res && (res.ok || res.type === 'opaque');

async function put(cacheName, request, response, max) {
  const cache = await caches.open(cacheName);
  await cache.put(request, response);
  const keys = await cache.keys();
  // Les plus anciennes copies partent en premier
  for (let i = 0; i < keys.length - max; i++) await cache.delete(keys[i]);
}

async function cacheFirst(request, cacheName, max) {
  const cached = await caches.match(request, { cacheName });
  if (cached) return cached;
  const response = await fetch(request);
  if (storable(response)) put(cacheName, request, response.clone(), max).catch(() => {});
  return response;
}

async function staleWhileRevalidate(request, cacheName, max) {
  const cached = await caches.match(request, { cacheName });
  const fresh = fetch(request)
    .then((response) => {
      if (storable(response)) put(cacheName, request, response.clone(), max).catch(() => {});
      return response;
    })
    .catch(() => cached || Response.error());
  return cached || fresh;
}
