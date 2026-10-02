// Photos du menu sur Cloudinary. Le navigateur réduit la photo avant l'envoi (voir frontend
// src/staff/menu/PhotoPicker.jsx) ; le serveur vérifie quand même le format et le poids.
import { cloudinary, cloudinaryEnabled } from '../lib/cloudinary.js';
import { env } from '../config/env.js';
import { AppError } from '../utils/AppError.js';

export const MAX_PHOTO_BYTES = 6 * 1024 * 1024;
export const ACCEPTED_LABEL = 'JPEG, PNG ou WebP';

// Format réel d'après les premiers octets du fichier (on ne se fie pas au nom ni au type annoncé)
export function detectImageType(buf) {
  if (!buf || buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  return null;
}

export function checkPhoto(buf) {
  if (!cloudinaryEnabled()) {
    throw new AppError(503, "L'envoi de photos n'est pas encore configuré sur le serveur (Cloudinary).", 'PHOTOS_NON_CONFIGUREES');
  }
  if (!buf?.length) throw new AppError(400, 'Aucune photo reçue. Choisissez une photo puis réessayez.', 'PHOTO_MANQUANTE');
  if (buf.length > MAX_PHOTO_BYTES) {
    throw new AppError(413, `Photo trop lourde (${(buf.length / 1024 / 1024).toFixed(1)} Mo). Maximum ${MAX_PHOTO_BYTES / 1024 / 1024} Mo.`, 'PHOTO_TROP_LOURDE');
  }
  if (!detectImageType(buf)) {
    throw new AppError(415, `Format de photo non accepté. Utilisez une photo ${ACCEPTED_LABEL}.`, 'FORMAT_NON_ACCEPTE');
  }
}

// Envoie la photo dans <CLOUDINARY_FOLDER>/<sous-dossier>. Taille bornée à 2000 px à l'arrivée :
// les tailles affichées sur le site sont produites à la demande par Cloudinary (voir frontend utils/visuals.js).
export function uploadPhoto(buf, subfolder) {
  checkPhoto(buf);
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: `${env.cloudinary.folder}/${subfolder}`,
        resource_type: 'image',
        transformation: [{ width: 2000, height: 2000, crop: 'limit' }],
      },
      (error, result) => {
        if (error || !result) {
          console.error('[cloudinary] envoi impossible', error?.message || error);
          return reject(new AppError(502, "La photo n'a pas pu être enregistrée. Réessayez dans un instant.", 'ENVOI_PHOTO_IMPOSSIBLE'));
        }
        resolve({ url: result.secure_url, publicId: result.public_id });
      },
    );
    stream.end(buf);
  });
}

// Une photo n'est supprimée que si elle est rangée dans le dossier de ce serveur. La base de développement
// (branche Neon « dev », copie du vrai site) pointe vers les photos du vrai site : en local, CLOUDINARY_FOLDER
// vaut « belchicken-dev », et remplacer une photo copiée ne doit jamais effacer celle du vrai site.
export const ownsPhoto = (publicId, folder = env.cloudinary.folder) => Boolean(publicId) && publicId.startsWith(`${folder}/`);

// Ménage sans bloquer : une photo orpheline sur Cloudinary ne doit jamais faire échouer l'action de l'équipe
export async function deletePhoto(publicId) {
  if (!publicId || !cloudinaryEnabled()) return;
  if (!ownsPhoto(publicId)) {
    console.log('[cloudinary] photo gardée (autre dossier)', publicId);
    return;
  }
  try {
    await cloudinary.uploader.destroy(publicId, { resource_type: 'image', invalidate: true });
  } catch (e) {
    console.error('[cloudinary] suppression impossible', publicId, e?.message || e);
  }
}
