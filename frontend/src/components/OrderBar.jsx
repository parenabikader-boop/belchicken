import { Link } from 'react-router-dom';
import { useCartDetails } from '../context/CartContext.jsx';
import { formatPrice } from '../utils/format.js';
import { useT } from '../i18n/index.jsx';

// Barre fixe en bas de la page Menu dès que la commande contient un article
export default function OrderBar() {
  const { count, total, ready } = useCartDetails();
  const t = useT();
  if (!count || !ready) return null;
  return (
    <div className="orderbar">
      <div className="wrap">
        <div className="sum1">
          <b>{formatPrice(total)}</b>
          <span>{t.orderBar.count(count)}</span>
        </div>
        <Link className="btn btn-p" to="/commande">{t.orderBar.see}</Link>
      </div>
    </div>
  );
}
