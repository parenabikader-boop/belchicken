// Neon (offre gratuite) se met en veille après quelques minutes sans requête et met plusieurs
// secondes à se réveiller. Pendant ce temps, Prisma échoue à se connecter : on réessaie.

// Codes Prisma où la base n'a pas été jointe, donc où la requête n'a pas pu s'exécuter :
// réessayer ne risque pas d'enregistrer une commande deux fois.
// P1001 base injoignable, P1002 délai de connexion dépassé, P2024 délai d'attente du pool dépassé.
const CONNECTION_CODES = new Set(['P1001', 'P1002', 'P2024']);

export function isConnectionError(err) {
  if (!err) return false;
  if (CONNECTION_CODES.has(err.code) || CONNECTION_CODES.has(err.errorCode)) return true;
  // Erreur au démarrage du client, sans code (ex. « Can't reach database server »)
  return err.name === 'PrismaClientInitializationError';
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Exécute run() et réessaie sur erreur de connexion, après 1 s puis 2 s, puis 4 s.
export async function withDbRetry(run, { delays = [1000, 2000, 4000], onRetry } = {}) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await run();
    } catch (err) {
      if (!isConnectionError(err) || attempt >= delays.length) throw err;
      onRetry?.(err, attempt + 1);
      await wait(delays[attempt]);
    }
  }
}

// Ajoute à l'URL de la base des délais plus longs que ceux de Prisma (5 s pour se connecter,
// 10 s pour obtenir une connexion du pool), sans écraser ceux déjà présents dans l'URL.
export function withLongTimeouts(url, { connect = 20, pool = 30 } = {}) {
  if (!url) return url;
  const u = new URL(url);
  if (!u.searchParams.has('connect_timeout')) u.searchParams.set('connect_timeout', String(connect));
  if (!u.searchParams.has('pool_timeout')) u.searchParams.set('pool_timeout', String(pool));
  return u.toString();
}
