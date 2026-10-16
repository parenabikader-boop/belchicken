import { lazy, Suspense } from 'react';
import { Navigate } from 'react-router-dom';
import Commande from './Commande.jsx';
import Valider from './Valider.jsx';
import { useSimpleOrder } from '../utils/site.js';

// Lot « Commande simplifiée » : page de commande unique, téléchargée seulement quand l'interrupteur est ouvert
const CommandeSimple = lazy(() => import('./CommandeSimple.jsx'));

// /commande : interrupteur ouvert, la page de commande unique (récapitulatif modifiable en haut) ; fermé, la page actuelle
export function CartPage() {
  return useSimpleOrder() ? <Navigate to="/valider" replace /> : <Commande />;
}

// /valider : interrupteur ouvert, la page de commande unique ; fermé, la page actuelle
export function CheckoutPage() {
  return useSimpleOrder() ? <Suspense fallback={null}><CommandeSimple /></Suspense> : <Valider />;
}
