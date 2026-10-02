// Les 3 photos de la mosaïque de l'accueil (table HomePhoto, cases 1 à 3).
// Case 1 : grande à gauche ; cases 2 et 3 : petites à droite.
import { prisma } from '../lib/prisma.js';
import { AppError } from '../utils/AppError.js';
import { homePhotos as ORIGINALS } from '../../prisma/menu-data.js';
import { deletePhoto, uploadPhoto } from './photo.service.js';

export const HOME_SLOTS = [1, 2, 3];
const select = { slot: true, imageUrl: true, alt: true, updatedAt: true };

// Une case vide en base reprend la photo d'origine : l'accueil a toujours ses 3 photos
export async function getHomePhotos() {
  const rows = await prisma.homePhoto.findMany({ select });
  return HOME_SLOTS.map((slot) => {
    const row = rows.find((r) => r.slot === slot);
    const original = ORIGINALS.find((o) => o.slot === slot);
    return { slot, imageUrl: row?.imageUrl || original.imageUrl, alt: row?.alt ?? original.alt, isOriginal: !row || row.imageUrl === original.imageUrl };
  });
}

function checkSlot(value) {
  const slot = Number(value);
  if (!HOME_SLOTS.includes(slot)) throw new AppError(404, "Cette photo de l'accueil n'existe pas (cases 1, 2 ou 3).", 'INTROUVABLE');
  return slot;
}

// La nouvelle photo est enregistrée avant de supprimer l'ancienne : en cas d'échec, rien n'est perdu.
export async function setHomePhoto(value, buffer) {
  const slot = checkSlot(value);
  const before = await prisma.homePhoto.findUnique({ where: { slot } });
  const photo = await uploadPhoto(buffer, 'accueil');
  const original = ORIGINALS.find((o) => o.slot === slot);
  try {
    await prisma.homePhoto.upsert({
      where: { slot },
      update: { imageUrl: photo.url, imagePublicId: photo.publicId },
      create: { slot, imageUrl: photo.url, imagePublicId: photo.publicId, alt: original.alt },
    });
  } catch (e) {
    await deletePhoto(photo.publicId);
    throw e;
  }
  await deletePhoto(before?.imagePublicId);
  return (await getHomePhotos()).find((p) => p.slot === slot);
}

// Remet la photo d'origine de la case (fichier du site) et supprime celle de Cloudinary
export async function resetHomePhoto(value) {
  const slot = checkSlot(value);
  const before = await prisma.homePhoto.findUnique({ where: { slot } });
  const original = ORIGINALS.find((o) => o.slot === slot);
  await prisma.homePhoto.upsert({
    where: { slot },
    update: { imageUrl: original.imageUrl, imagePublicId: null, alt: original.alt },
    create: original,
  });
  await deletePhoto(before?.imagePublicId);
  return (await getHomePhotos()).find((p) => p.slot === slot);
}
