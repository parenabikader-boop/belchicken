import { Router } from 'express';
import { requireStaff } from '../middlewares/staff-auth.js';
import { requireFeature } from '../middlewares/feature.js';
import { orderSchema } from '../services/menu-edit.js';
import { bandSchema, bandUpdateSchema, settingsSchema, zoneSchema, zoneUpdateSchema } from '../services/delivery-fees.js';
import {
  createBand, createZone, deleteBand, getStaffGrid, reorderZones, setSettings, updateBand, updateZone,
} from '../services/delivery-fees.service.js';

// Page « Frais de livraison » : Patron seulement (quartiers, tranches de distance, « Autre quartier »)
export const staffDeliveryFeesRouter = Router();
// Fermée par le Prestataire (lot 4) : seule la page est fermée, la grille continue de calculer les frais
staffDeliveryFeesRouter.use(requireStaff('PATRON'), requireFeature('FRAIS_LIVRAISON'));

const handle = (fn) => async (req, res, next) => {
  try {
    await fn(req, res);
  } catch (e) {
    next(e);
  }
};

staffDeliveryFeesRouter.get('/', handle(async (req, res) => {
  res.json(await getStaffGrid());
}));

staffDeliveryFeesRouter.post('/zones', handle(async (req, res) => {
  res.status(201).json(await createZone(zoneSchema.parse(req.body)));
}));

// Ordre des quartiers (avant /zones/:id)
staffDeliveryFeesRouter.put('/zones/order', handle(async (req, res) => {
  res.json(await reorderZones(orderSchema.parse(req.body).ids));
}));

staffDeliveryFeesRouter.patch('/zones/:id', handle(async (req, res) => {
  res.json(await updateZone(req.params.id, zoneUpdateSchema.parse(req.body)));
}));

staffDeliveryFeesRouter.post('/bands', handle(async (req, res) => {
  const { upToKm, ...band } = bandSchema.parse(req.body);
  res.status(201).json(await createBand({ ...band, upToMeters: upToKm }));
}));

staffDeliveryFeesRouter.patch('/bands/:id', handle(async (req, res) => {
  const { upToKm, ...band } = bandUpdateSchema.parse(req.body);
  res.json(await updateBand(req.params.id, { ...band, ...(upToKm != null ? { upToMeters: upToKm } : {}) }));
}));

staffDeliveryFeesRouter.delete('/bands/:id', handle(async (req, res) => {
  res.json(await deleteBand(req.params.id));
}));

staffDeliveryFeesRouter.put('/settings', handle(async (req, res) => {
  res.json(await setSettings(settingsSchema.parse(req.body)));
}));
