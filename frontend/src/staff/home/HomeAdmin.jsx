import { useEffect, useState } from 'react';
import { staffApi } from '../../api/client.js';
import { photoUrl } from '../../utils/visuals.js';
import PhotoPicker from '../menu/PhotoPicker.jsx';

// Les 3 photos de l'accueil (Patron). Même fonctionnement que les photos du menu :
// aperçu, recadrage au format de la case, envoi sur Cloudinary. « Remettre la photo d'origine »
// revient à la photo de départ du site (l'accueil garde toujours ses 3 photos).
const SLOTS = [
  { slot: 1, title: 'Grande photo (à gauche)', shape: 'tall' },
  { slot: 2, title: 'Petite photo du haut (à droite)', shape: 'tile' },
  { slot: 3, title: 'Petite photo du bas (à droite)', shape: 'tile' },
];

function Mosaic({ photos }) {
  return (
    <div className="hm-mosaic" aria-hidden="true">
      {SLOTS.map(({ slot }) => {
        const p = photos.find((x) => x.slot === slot);
        return <div key={slot}><img src={photoUrl(p.imageUrl, 500)} alt="" /><span>{slot}</span></div>;
      })}
    </div>
  );
}

export default function HomeAdmin() {
  const [photos, setPhotos] = useState(null);
  const [error, setError] = useState(null);

  const load = () => {
    setError(null);
    staffApi.getHomePhotos().then(setPhotos, setError);
  };
  useEffect(load, []);

  const update = (photo) => setPhotos((list) => list.map((p) => (p.slot === photo.slot ? photo : p)));

  if (error) {
    return (
      <>
        <div className="alert err" role="alert"><span>{error.message}</span></div>
        <button type="button" className="btn btn-p" style={{ marginTop: 14 }} onClick={load}>Réessayer</button>
      </>
    );
  }
  if (!photos) return <p className="st-muted">Chargement des photos…</p>;

  return (
    <div className="hm">
      <div className="st-head">
        <h1 className="st-title">Photos de l'accueil</h1>
      </div>
      <p className="st-muted hm-intro">
        Les 3 photos en haut de la page d'accueil du site. Chaque photo est recadrée au format de sa case.
      </p>
      <Mosaic photos={photos} />
      {SLOTS.map(({ slot, title, shape }) => {
        const p = photos.find((x) => x.slot === slot);
        return (
          <PhotoPicker
            key={slot}
            title={`${slot}. ${title}`}
            shape={shape}
            currentUrl={p.imageUrl}
            onSave={async (blob) => update(await staffApi.setHomePhoto(slot, blob))}
            onRemove={p.isOriginal ? null : async () => update(await staffApi.resetHomePhoto(slot))}
            removeLabel="Remettre la photo d'origine"
          />
        );
      })}
    </div>
  );
}
