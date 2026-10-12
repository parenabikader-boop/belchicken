// Démonstration : garde-fou du serveur et photo de la base dev (avant le remplissage, après l'effacement).
// Photo : pour chaque table, le nombre de lignes et une empreinte de leur contenu (jamais le contenu lui-même),
// plus une copie exacte des réglages que la démonstration change, pour les remettre comme avant.
import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { RESTORED_TABLES, projectRows, serverError, serverNameOf } from './demo-commun.js';

// Avant tout accès à la base : dev seulement. N'affiche que le nom du serveur.
export function assertDev() {
  const urls = [process.env.DATABASE_URL, process.env.DIRECT_URL].filter(Boolean);
  const error = urls.length ? serverError(urls) : 'Adresse de la base absente de backend/.env.';
  if (error) {
    console.error(`ARRÊT : ${error}`);
    process.exit(1);
  }
  console.log(`Base : ${serverNameOf(urls[0])} (dev)`);
}

const delegate = (model) => model.charAt(0).toLowerCase() + model.slice(1);
const keyOf = (row) => String(row.id ?? row.key ?? row.slot ?? JSON.stringify(row));
const hashRows = (rows) =>
  createHash('sha256')
    .update(JSON.stringify([...rows].sort((a, b) => (keyOf(a) < keyOf(b) ? -1 : keyOf(a) > keyOf(b) ? 1 : 0))))
    .digest('hex');

// columns : { appSettings: [...] } (photoColumns) pour la photo d'après, colonnes de la photo d'avant seulement
export async function takePhoto(prisma, takenAt = new Date(), columns = {}) {
  const tables = {};
  for (const { name } of Prisma.dmmf.datamodel.models) {
    const rows = await prisma[delegate(name)].findMany();
    const keys = columns[delegate(name)];
    tables[name] = { count: rows.length, hash: hashRows(keys ? projectRows(rows, keys) : rows) };
    // Journal de sécurité : empreinte des seules lignes d'avant la photo de référence (voir comparePhotos)
    if (name === 'SecurityLog') tables[name].rows = rows.map((r) => ({ at: r.at.toISOString(), row: r }));
  }
  // Réglages et grille des frais : copie exacte de chaque ligne, pour les remettre comme avant
  const settings = {};
  for (const { model } of RESTORED_TABLES) settings[model] = await prisma[model].findMany();
  return { takenAt: takenAt.toISOString(), tables, settings };
}

// Photo enregistrée : sans les lignes du journal de sécurité (seulement leur empreinte)
export function photoToSave(photo) {
  const tables = Object.fromEntries(Object.entries(photo.tables).map(([k, v]) => [k, { count: v.count, hash: v.hash }]));
  return { ...photo, tables };
}

// Photo d'après, comparable à celle d'avant : empreinte du journal limitée aux lignes d'avant `since`
export function photoSince(photo, since) {
  const log = photo.tables.SecurityLog;
  const old = log.rows.filter((r) => r.at <= since).map((r) => r.row);
  return { ...photo, tables: { ...photo.tables, SecurityLog: { count: log.count, hash: log.hash, hashUntilPhoto: hashRows(old) } } };
}
