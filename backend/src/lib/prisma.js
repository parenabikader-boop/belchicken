import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { withDbRetry, withLongTimeouts } from './db-retry.js';

// Chaque requête est réessayée si la base dort encore (réveil de Neon, voir db-retry.js)
export const prisma = new PrismaClient({ datasourceUrl: withLongTimeouts(process.env.DATABASE_URL) }).$extends({
  query: {
    async $allOperations({ args, query, model, operation }) {
      return withDbRetry(() => query(args), {
        onRetry: (err, n) => console.warn(`[base] ${model ?? ''}.${operation} : base injoignable, nouvel essai ${n} (${err.code || err.errorCode || err.name})`),
      });
    },
  },
});
