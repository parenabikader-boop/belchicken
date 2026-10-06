import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client.js';
import { photoProps } from '../utils/visuals.js';

// Photos de l'accueil, changées par le Patron depuis l'espace équipe (API /api/home) :
// grande image à gauche (case 1), deux petites à droite (cases 2 et 3).
// Photos d'origine (sources dans docs/photos/) : taille et partie gardée visible quand la case les recadre.
// Celles envoyées depuis l'espace équipe sont déjà recadrées au format de leur case.
const ORIGINAL = {
  '/accueil/burger.webp': { w: 760, h: 950, pos: 'center 62%' },
  '/accueil/wings.webp': { w: 763, h: 348, pos: 'center' },
  '/accueil/bucket.webp': { w: 763, h: 354, pos: 'center 40%' },
};
const FALLBACK = Object.keys(ORIGINAL).map((imageUrl, i) => ({ slot: i + 1, imageUrl, alt: '' }));
const SIZES = {
  1: [[400, 640, 900], '(max-width: 980px) 55vw, 330px'],
  2: [[320, 520, 760], '(max-width: 980px) 45vw, 270px'],
  3: [[320, 520, 760], '(max-width: 980px) 45vw, 270px'],
};

function useHomePhotos() {
  const [photos, setPhotos] = useState(null);
  useEffect(() => {
    let on = true;
    api.getHomePhotos().then((p) => on && setPhotos(p), () => on && setPhotos(FALLBACK));
    return () => {
      on = false;
    };
  }, []);
  return photos;
}

export default function Home() {
  const photos = useHomePhotos();
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
            {(photos || FALLBACK).map((m) => {
              const o = ORIGINAL[m.imageUrl];
              // Tant que les photos ne sont pas connues, les cases restent vides (pas d'ancienne photo qui clignote)
              return (
                <div key={m.slot}>
                  {photos && (
                    <img
                      {...photoProps(m.imageUrl, ...SIZES[m.slot])}
                      alt={m.alt || ''}
                      width={o?.w}
                      height={o?.h}
                      style={o ? { objectPosition: o.pos } : undefined}
                      fetchPriority={m.slot === 1 ? 'high' : undefined}
                    />
                  )}
                </div>
              );
            })}
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
            <span className="brand-script">Finest Fried Chicken & More</span>
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
