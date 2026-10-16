import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { env } from './config/env.js';
import { menuRouter } from './routes/menu.routes.js';
import { homeRouter } from './routes/home.routes.js';
import { orderRouter } from './routes/order.routes.js';
import { paymentRouter } from './routes/payment.routes.js';
import { deliveryRouter } from './routes/delivery.routes.js';
import { reviewRouter } from './routes/review.routes.js';
import { siteRouter } from './routes/site.routes.js';
import { paymentAutoRouter } from './routes/payment-auto.routes.js';
import { staffRouter } from './routes/staff.routes.js';
import { errorHandler, notFound } from './middlewares/errors.js';

export const app = express();

app.set('trust proxy', 1); // derrière le proxy Render : IP réelle pour le rate limit
app.use(helmet());
app.use(cors({ origin: env.corsOrigins }));
app.use(express.json({ limit: '100kb' }));

app.get('/api/health', (req, res) => res.json({ ok: true, service: 'belchicken-api' }));
app.use('/api/menu', menuRouter);
app.use('/api/home', homeRouter);
app.use('/api/orders', orderRouter);
app.use('/api/payment', paymentRouter);
app.use('/api/delivery', deliveryRouter); // grille des frais de livraison et aperçu
app.use('/api/avis', reviewRouter); // lot 7 : avis des clients (page publique, par la clé du lien)
app.use('/api/site', siteRouter);
app.use('/api/paiements', paymentAutoRouter); // plan 2 : paiements reçus (SMS du téléphone marchand, Ligdicash) // lot 8 : bouton FR / EN du site client
app.use('/api/staff', staffRouter); // espace équipe, protégé par connexion

app.use(notFound);
app.use(errorHandler);
