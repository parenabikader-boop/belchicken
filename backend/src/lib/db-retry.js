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

// P1017 : Neon a fermé une connexion restée ouverte dans le pool (mise en veille de la base, réseau).
// La requête a pu s'exécuter avant la coupure : on ne la réessaie que si c'est une lecture.
export function isClosedConnection(err) {
  return err?.code === 'P1017' || err?.errorCode === 'P1017';
}

// Opérations Prisma qui ne font que lire. Tout le reste (create, update, upsert, delete, *Many,
// $queryRaw, $executeRaw…) peut écrire : jamais réessayé après une coupure.
export const READ_OPERATIONS = new Set([
  'findUnique', 'findUniqueOrThrow', 'findFirst', 'findFirstOrThrow', 'findMany',
  'count', 'aggregate', 'groupBy',
]);

// Prisma garde plusieurs connexions ouvertes et ne jette une connexion coupée qu'en tombant dessus :
// quand Neon les coupe toutes, il faut parfois plusieurs essais (immédiats, ils échouent tout de suite).
export const CLOSED_RETRIES = 10;

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Exécute run() et réessaie sur erreur de connexion, après 1 s puis 2 s, puis 4 s.
// Avec read: true, une connexion fermée par Neon (P1017) est aussi réessayée, tout de suite, CLOSED_RETRIES fois au plus.
export async function withDbRetry(run, { delays = [1000, 2000, 4000], onRetry, read = false } = {}) {
  let closedRetries = 0;
  for (let attempt = 0; ; ) {
    try {
      return await run();
    } catch (err) {
      if (read && closedRetries < CLOSED_RETRIES && isClosedConnection(err)) {
        closedRetries++;
        onRetry?.(err, closedRetries);
        continue;
      }
      if (!isConnectionError(err) || attempt >= delays.length) throw err;
      onRetry?.(err, attempt + 1);
      await wait(delays[attempt++]);
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
