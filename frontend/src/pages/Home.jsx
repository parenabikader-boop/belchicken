import { Link } from 'react-router-dom';
import { PHOTO_BG } from '../utils/visuals.js';

const MOSAIC = ['finest', 'wings12', 'friends'];

export default function Home() {
  return (
    <>
      <section className="hero">
        <div className="wrap">
          <div>
            <h1>Commandez votre repas Belchicken en ligne</h1>
            <p className="lead">Choisissez vos plats, envoyez votre commande, et notre équipe vous confirme tout sur WhatsApp.</p>
            <div className="cta">
              <Link className="btn btn-p" to="/menu">Voir le menu</Link>
              <Link className="lnk" to="/infos">Livraison et paiement ›</Link>
            </div>
          </div>
          <div className="mosaic">
            {MOSAIC.map((k, i) => (
              <div key={k} style={{ background: PHOTO_BG[k] }}>
                <img src={`/menu/${k}.jpg`} alt="" fetchPriority={i === 0 ? 'high' : undefined} />
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="wrap home-steps">
        <div className="sec-h"><div><h2>Comment commander</h2></div></div>
        <div className="steps">
          <div className="step"><b>Choisissez vos plats</b><p>Parcourez le menu par catégorie.</p></div>
          <div className="step"><b>Vérifiez votre commande</b><p>Ajustez les quantités si besoin.</p></div>
          <div className="step"><b>Indiquez vos informations</b><p>Coordonnées, paiement et position.</p></div>
          <div className="step"><b>Recevez la confirmation</b><p>Notre équipe vous contacte sur WhatsApp.</p></div>
        </div>
      </section>
    </>
  );
}
