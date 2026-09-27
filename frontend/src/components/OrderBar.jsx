import { Link } from 'react-router-dom';
import { useCartDetails } from '../context/CartContext.jsx';
import { formatPrice } from '../utils/format.js';

// Barre fixe en bas de la page Menu dès que la commande contient un article
export default function OrderBar() {
  const { count, total, ready } = useCartDetails();
  if (!count || !ready) return null;
  return (
    <div className="orderbar">
      <div className="wrap">
        <div className="sum1">
          <b>{formatPrice(total)}</b>
          <span>{count} article{count > 1 ? 's' : ''} dans votre commande</span>
        </div>
        <Link className="btn btn-p" to="/commande">Voir ma commande</Link>
      </div>
    </div>
  );
}
