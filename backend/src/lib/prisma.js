import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { READ_OPERATIONS, isClosedConnection, withDbRetry, withLongTimeouts } from './db-retry.js';

// Délai des transactions (Prisma : 5 s par défaut). Porté à 15 s le 10 octobre 2026 : depuis un PC au Burkina,
// chaque requête vers Neon (us-east-2) prend ~300 ms et « Paiement vérifié » dépassait 5 s. Les transactions qui
// règlent leur propre délai, plus long, le gardent (code de secours du Prestataire, remplissage du menu).
export const TRANSACTION_TIMEOUT_MS = 15000;

// Chaque requête est réessayée si la base dort encore (réveil de Neon, voir db-retry.js).
// Une lecture est aussi réessayée si Neon a fermé la connexion (P1017), jamais un enregistrement.
export const prisma = new PrismaClient({
  datasourceUrl: withLongTimeouts(process.env.DATABASE_URL),
  transactionOptions: { timeout: TRANSACTION_TIMEOUT_MS },
}).$extends({
  query: {
    async $allOperations({ args, query, model, operation }) {
      return withDbRetry(() => query(args), {
        read: READ_OPERATIONS.has(operation),
        onRetry: (err, n) => console.warn(`[base] ${model ?? ''}.${operation} : ${isClosedConnection(err) ? 'connexion fermée par Neon' : 'base injoignable'}, nouvel essai ${n} (${err.code || err.errorCode || err.name})`),
      });
    },
  },
});
