import { Link } from 'react-router-dom';
// Photos de l'accueil (sources dans docs/photos/) : grande image à gauche, deux petites à droite.
// pos : partie de la photo gardée visible quand la case la recadre.
const MOSAIC = [
  { src: '/accueil/burger.webp', w: 760, h: 950, pos: 'center 62%' },
  { src: '/accueil/wings.webp', w: 763, h: 348, pos: 'center' },
  { src: '/accueil/bucket.webp', w: 763, h: 354, pos: 'center 40%' },
];

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
            {MOSAIC.map((m, i) => (
              <div key={m.src}>
                <img src={m.src} alt="" width={m.w} height={m.h} style={{ objectPosition: m.pos }} fetchPriority={i === 0 ? 'high' : undefined} />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Le vrai logo, sur fond brun foncé (il est prévu pour un fond sombre) */}
      <section className="brand-band">
        <div className="wrap">
          <img
            className="brand-logo"
            src="/brand/logo-belchicken-560.webp"
            srcSet="/brand/logo-belchicken-560.webp 560w, /brand/logo-belchicken-1120.webp 1120w"
            sizes="(max-width: 640px) 260px, 440px"
            width="560"
            height="452"
            alt="Belchicken"
            loading="lazy"
          />
          <div className="brand-txt">
            <span className="brand-script">Fresh fried chicken</span>
            <h2>Le chef Belchicken vous régale</h2>
            <p>Poulet croustillant, burgers et buckets, préparés à la commande.</p>
            <Link className="btn brand-btn" to="/menu">Voir le menu</Link>
          </div>
        </div>
      </section>

      <section className="wrap home-steps">
        <div className="sec-h"><div><h2>Comment commander</h2></div></div>
        <div className="steps-wrap">
          <img className="steps-ph" src="/accueil/livraison.webp" width="763" height="301" alt="Un livreur Belchicken remet une commande à une cliente" loading="lazy" />
          <div className="steps">
          <div className="step"><b>Choisissez vos plats</b><p>Parcourez le menu par catégorie.</p></div>
          <div className="step"><b>Vérifiez votre commande</b><p>Ajustez les quantités si besoin.</p></div>
          <div className="step"><b>Indiquez vos informations</b><p>Coordonnées, paiement et position.</p></div>
          <div className="step"><b>Recevez la confirmation</b><p>Notre équipe vous contacte sur WhatsApp.</p></div>
          </div>
        </div>
      </section>
    </>
  );
}
