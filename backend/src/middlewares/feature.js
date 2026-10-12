import { featureClosedError, isFeatureOpen } from '../services/features.service.js';

// Lot 4 : route d'une fonction que le Prestataire peut fermer (features.js). Fermée : refusée pour tout
// le monde, Prestataire compris, avec « Fonction non incluse dans votre formule, contactez votre prestataire ».
// staffFeature : lu par test/route-access.test.js (quelle adresse dépend de quel interrupteur)
export const requireFeature = (key) => {
  const guard = async (req, res, next) => {
    try {
      if (!(await isFeatureOpen(key))) return next(featureClosedError());
      next();
    } catch (e) {
      next(e);
    }
  };
  guard.staffFeature = key;
  return guard;
};
