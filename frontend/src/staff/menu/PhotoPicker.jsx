import { useEffect, useRef, useState } from 'react';
import { photoUrl } from '../../utils/visuals.js';

// Choix d'une photo depuis un téléphone (appareil photo ou galerie) ou un ordinateur.
// Aperçu, recadrage simple si on le souhaite, puis « Enregistrer la photo ». La photo est réduite dans
// le navigateur (1600 px, JPEG) avant l'envoi : rapide même en 3G, et toujours sous la limite du serveur.
const MAX_INPUT_MB = 20; // photo d'origine, avant réduction
const MAX_SEND_MB = 5; // après réduction (le serveur accepte 6 Mo)
const MAX_SIDE = 1600;
const KEEP_SIDE = 2400; // photo gardée en mémoire pour le recadrage
const SMALL_SIDE = 500;
const ACCEPT = 'image/jpeg,image/png,image/webp,image/heic,image/heif';
const FORMAT_MSG = 'Format non accepté. Choisissez une photo JPEG, PNG ou WebP (les photos de téléphone le sont en général).';

const mb = (bytes) => (bytes / 1024 / 1024).toFixed(1).replace('.', ',');

async function decode(file) {
  if ('createImageBitmap' in window) {
    try {
      return await createImageBitmap(file); // tient compte de l'orientation EXIF
    } catch {
      /* essai avec <img> ci-dessous */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

// Ouvre la photo et la garde en mémoire (2400 px au plus) pour l'aperçu et le recadrage.
// Renvoie { source, width, height, small }.
export async function loadPhoto(file) {
  if (file.type && !file.type.startsWith('image/')) throw new Error(FORMAT_MSG);
  if (file.size > MAX_INPUT_MB * 1024 * 1024) {
    throw new Error(`Photo trop lourde (${mb(file.size)} Mo). Maximum ${MAX_INPUT_MB} Mo : choisissez-en une autre ou réduisez-la.`);
  }
  let image;
  try {
    image = await decode(file);
  } catch {
    throw new Error(FORMAT_MSG);
  }
  const w0 = image.width;
  const h0 = image.height;
  if (!w0 || !h0) throw new Error(FORMAT_MSG);
  const scale = Math.min(1, KEEP_SIDE / Math.max(w0, h0));
  const source = document.createElement('canvas');
  source.width = Math.round(w0 * scale);
  source.height = Math.round(h0 * scale);
  const ctx = source.getContext('2d');
  ctx.fillStyle = '#fff'; // fond blanc pour les PNG transparents
  ctx.fillRect(0, 0, source.width, source.height);
  ctx.drawImage(image, 0, 0, source.width, source.height);
  image.close?.();
  return { source, width: w0, height: h0, small: Math.max(w0, h0) < SMALL_SIDE };
}

// Zone gardée d'après le recadrage { ratio, zoom, cx, cy } (cx, cy : centre, entre 0 et 1), ou photo entière.
export function cropBox(sw, sh, crop) {
  if (!crop) return { x: 0, y: 0, w: sw, h: sh };
  let w = sh * crop.ratio > sw ? sw : sh * crop.ratio;
  let h = w / crop.ratio;
  w /= crop.zoom;
  h /= crop.zoom;
  const x = Math.min(Math.max(crop.cx * sw - w / 2, 0), sw - w);
  const y = Math.min(Math.max(crop.cy * sh - h / 2, 0), sh - h);
  return { x, y, w, h };
}

// Photo finale : zone recadrée, réduite à 1600 px, en JPEG
export async function exportPhoto(source, crop) {
  const box = cropBox(source.width, source.height, crop);
  const scale = Math.min(1, MAX_SIDE / Math.max(box.w, box.h));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(box.w * scale);
  canvas.height = Math.round(box.h * scale);
  canvas.getContext('2d').drawImage(source, box.x, box.y, box.w, box.h, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85));
  if (!blob) throw new Error("La photo n'a pas pu être préparée. Essayez avec une autre photo.");
  if (blob.size > MAX_SEND_MB * 1024 * 1024) throw new Error(`Photo trop lourde même réduite (${mb(blob.size)} Mo). Choisissez-en une autre.`);
  return { blob, width: canvas.width, height: canvas.height };
}

// Recadrage : on fait glisser la photo dans le cadre (doigt ou souris) et on zoome avec le curseur.
function CropEditor({ src, sw, sh, crop, onChange }) {
  const frameRef = useRef(null);
  const drag = useRef(null);
  const box = cropBox(sw, sh, crop);
  // La zone gardée remplit le cadre : on place et agrandit la photo en conséquence
  const style = {
    width: `${(sw / box.w) * 100}%`,
    height: `${(sh / box.h) * 100}%`,
    left: `${(-box.x / box.w) * 100}%`,
    top: `${(-box.y / box.h) * 100}%`,
  };
  const recenter = (b) => ({ ...crop, cx: (b.x + b.w / 2) / sw, cy: (b.y + b.h / 2) / sh });

  const down = (e) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { px: e.clientX, py: e.clientY, box };
  };
  const move = (e) => {
    if (!drag.current) return;
    const { px, py, box: b } = drag.current;
    const k = b.w / frameRef.current.clientWidth; // pixels de la photo par pixel d'écran
    const x = Math.min(Math.max(b.x - (e.clientX - px) * k, 0), sw - b.w);
    const y = Math.min(Math.max(b.y - (e.clientY - py) * k, 0), sh - b.h);
    onChange(recenter({ ...b, x, y }));
  };
  const up = () => { drag.current = null; };

  return (
    <div className="ph-crop">
      <div
        ref={frameRef}
        className="ph-crop-frame"
        style={{ aspectRatio: crop.ratio }}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
      >
        <img src={src} alt="Photo à recadrer" draggable={false} style={style} />
      </div>
      <label className="ph-zoom">
        <span>Zoom</span>
        <input type="range" min="1" max="3" step="0.01" value={crop.zoom} onChange={(e) => onChange({ ...crop, zoom: Number(e.target.value) })} />
      </label>
      <p className="st-muted ph-hint">Faites glisser la photo pour choisir ce qui reste dans le cadre.</p>
    </div>
  );
}

// Format du recadrage selon l'endroit où la photo s'affiche sur le site
const CROP_RATIO = { card: 4 / 3, banner: 3 / 2, wide: 16 / 9, tall: 4 / 5 };

export default function PhotoPicker({ title, currentUrl, shape = 'card', onSave, onRemove, removeLabel = 'Retirer la photo', emptyLabel = 'Aucune photo' }) {
  const [photo, setPhoto] = useState(null); // { source, width, height, small, url }
  const [crop, setCrop] = useState(null); // null = photo entière
  const [busy, setBusy] = useState(null); // 'prepare' | 'save' | 'remove'
  const [error, setError] = useState(null);
  const [done, setDone] = useState(null);
  const cameraRef = useRef(null);
  const galleryRef = useRef(null);
  const touch = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches;

  useEffect(() => () => photo && URL.revokeObjectURL(photo.url), [photo]);

  const pick = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // permet de rechoisir la même photo
    if (!file) return;
    setError(null);
    setDone(null);
    setCrop(null);
    setBusy('prepare');
    try {
      const p = await loadPhoto(file);
      const preview = await new Promise((resolve) => p.source.toBlob(resolve, 'image/jpeg', 0.9));
      setPhoto({ ...p, url: URL.createObjectURL(preview) });
    } catch (err) {
      setPhoto(null);
      setError(err.message);
    } finally {
      setBusy(null);
    }
  };

  const cancel = () => {
    setPhoto(null);
    setCrop(null);
  };

  const save = async () => {
    setBusy('save');
    setError(null);
    try {
      const { blob } = await exportPhoto(photo.source, crop);
      await onSave(blob);
      cancel();
      setDone('Photo enregistrée. Elle apparaît sur le site d’ici 30 secondes.');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(null);
    }
  };

  const remove = async () => {
    setBusy('remove');
    setError(null);
    try {
      await onRemove();
      setDone('Photo retirée.');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(null);
    }
  };

  const current = (
    <div className={`ph-frame ${shape}`}>{currentUrl ? <img src={photoUrl(currentUrl, 600)} alt="" /> : <span>{emptyLabel}</span>}</div>
  );
  const kept = photo && cropBox(photo.source.width, photo.source.height, crop);

  return (
    <section className="st-box mn-box mn-photo">
      <h2>{title}</h2>

      {photo ? (
        <div className="ph-compare">
          <figure>
            {current}
            <figcaption>Actuelle</figcaption>
          </figure>
          <figure className={`ph-new${crop ? ' cropping' : ''}`}>
            {crop ? (
              <CropEditor src={photo.url} sw={photo.source.width} sh={photo.source.height} crop={crop} onChange={setCrop} />
            ) : (
              <div className={`ph-frame ${shape} new`}><img src={photo.url} alt="Aperçu de la nouvelle photo" /></div>
            )}
            <figcaption>
              <b>Nouvelle</b> · {crop ? 'recadrée' : 'telle quelle'} · {Math.round(kept.w)} × {Math.round(kept.h)} px
            </figcaption>
          </figure>
        </div>
      ) : (
        current
      )}
      {photo && (
        <div className="ph-mode" role="group" aria-label="Recadrage">
          <button type="button" className={crop ? '' : 'on'} aria-pressed={!crop} disabled={!!busy} onClick={() => setCrop(null)}>Telle quelle</button>
          <button
            type="button"
            className={crop ? 'on' : ''}
            aria-pressed={!!crop}
            disabled={!!busy}
            onClick={() => setCrop((c) => c || { ratio: CROP_RATIO[shape] || 4 / 3, zoom: 1, cx: 0.5, cy: 0.5 })}
          >
            Recadrer
          </button>
        </div>
      )}

      {photo?.small && <p className="mn-warn ph-msg">Photo petite : elle risque d'être floue sur le site. Une photo plus grande est préférable.</p>}
      {error && <div className="alert err ph-msg" role="alert"><span>{error}</span></div>}
      {done && !error && <div className="alert ok ph-msg" role="status"><span>{done}</span></div>}
      {busy === 'prepare' && <p className="st-muted ph-msg">Préparation de la photo…</p>}

      {/* Deux champs : appareil photo (capture) et galerie. Sur ordinateur, les deux ouvrent le choix de fichier. */}
      <input ref={cameraRef} type="file" accept={ACCEPT} capture="environment" hidden onChange={pick} />
      <input ref={galleryRef} type="file" accept={ACCEPT} hidden onChange={pick} data-testid="photo-file" />

      {photo ? (
        <div className="ph-actions">
          <button type="button" className="btn btn-p" disabled={!!busy} onClick={save}>{busy === 'save' ? 'Envoi en cours…' : 'Enregistrer la photo'}</button>
          <button type="button" className="btn btn-s" disabled={!!busy} onClick={cancel}>Annuler</button>
        </div>
      ) : (
        <div className="ph-actions">
          {touch && <button type="button" className="btn btn-s" disabled={!!busy} onClick={() => cameraRef.current.click()}>Prendre une photo</button>}
          <button type="button" className="btn btn-s" disabled={!!busy} onClick={() => galleryRef.current.click()}>
            {touch ? 'Choisir dans la galerie' : currentUrl ? 'Changer la photo' : 'Choisir une photo'}
          </button>
          {currentUrl && onRemove && (
            <button type="button" className="st-text-btn danger" disabled={!!busy} onClick={remove}>{busy === 'remove' ? 'Retrait…' : removeLabel}</button>
          )}
        </div>
      )}
      <p className="st-muted ph-hint">JPEG, PNG ou WebP, {MAX_INPUT_MB} Mo au plus. La photo est réduite automatiquement avant l'envoi.</p>
    </section>
  );
}
