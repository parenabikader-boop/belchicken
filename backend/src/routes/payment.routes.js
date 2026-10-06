import { Router } from 'express';
import { env } from '../config/env.js';
import { paymentCodes } from '../services/payment-codes.js';

// Codes marchands des 3 opérateurs, avec MONTANT : le site les remplit avec le montant à payer
export const paymentRouter = Router();

paymentRouter.get('/', (req, res) => {
  res.set('Cache-Control', 'public, max-age=60');
  res.json(paymentCodes(env.payment));
});
