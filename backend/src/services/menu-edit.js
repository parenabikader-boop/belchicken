// Règles de modification du menu depuis l'espace équipe, sans accès à la base (testées dans test/menu-edit.test.js).
import { z } from 'zod';

// "Poulet frit à l'ail" -> "poulet-frit-a-l-ail"
export function slugify(text) {
  const s = String(text)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/œ/g, 'oe')
    .replace(/æ/g, 'ae')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50)
    .replace(/-+$/, '');
  return s || 'element';
}

// Premier slug libre : "finest", sinon "finest-2", "finest-3"…
export function uniqueSlug(base, taken) {
  const used = new Set(taken);
  if (!used.has(base)) return base;
  for (let i = 2; ; i++) if (!used.has(`${base}-${i}`)) return `${base}-${i}`;
}

// Formules envoyées par l'écran -> ce qu'il faut créer, modifier et supprimer.
// Les formules existantes gardent leur id (et leur code), les nouvelles reçoivent un code libre.
export function planVariants(existing, wanted) {
  const byId = new Map(existing.map((v) => [v.id, v]));
  const codes = existing.map((v) => v.code);
  const keep = new Set();
  const update = [];
  const create = [];
  wanted.forEach((v, position) => {
    const data = { label: v.label, subLabel: v.subLabel ?? null, price: v.price, position };
    if (v.id) {
      if (!byId.has(v.id)) throw new Error(`Formule inconnue : ${v.id}`);
      keep.add(v.id);
      update.push({ id: v.id, ...data });
    } else {
      const code = uniqueSlug(slugify(v.label), codes);
      codes.push(code);
      create.push({ code, ...data });
    }
  });
  const remove = existing.filter((v) => !keep.has(v.id)).map((v) => v.id);
  return { update, create, remove };
}

// ─── Validation des formulaires ───

const text = (max, label) =>
  z.string().trim().max(max, `${label} : ${max} caractères au plus.`);
const optionalText = (max, label) =>
  text(max, label).nullish().transform((v) => (v ? v : null));
const list = (max, itemMax, label) =>
  z
    .array(text(itemMax, label))
    .max(max, `${label} : ${max} lignes au plus.`)
    .default([])
    .transform((a) => a.filter(Boolean));

export const MAX_PRICE = 1_000_000;

const variantSchema = z.object({
  id: z.string().max(40).optional(),
  label: text(40, 'Nom de la formule').min(1, 'Donnez un nom à chaque formule (ex. « Menu », « Seul »).'),
  subLabel: optionalText(60, 'Précision de la formule'),
  price: z
    .number({ invalid_type_error: 'Indiquez un prix en francs CFA.', required_error: 'Indiquez un prix en francs CFA.' })
    .int('Le prix doit être un nombre entier de francs.')
    .min(1, 'Le prix doit être supérieur à 0 F.')
    .max(MAX_PRICE, 'Prix trop élevé.'),
});

export const productSchema = z
  .object({
    name: text(80, 'Nom').min(1, 'Indiquez le nom du plat.'),
    number: z.number().int().min(1, 'Numéro entre 1 et 999.').max(999, 'Numéro entre 1 et 999.').nullish().transform((v) => v ?? null),
    description: optionalText(300, 'Description'),
    composition: list(10, 120, 'Composition'),
    isSpicy: z.boolean().default(false),
    serves: optionalText(40, 'Nombre de personnes'),
    choiceLabel: optionalText(60, 'Question du choix'),
    choices: list(8, 40, 'Choix'),
    categoryId: z.string({ required_error: 'Choisissez une catégorie.' }).min(1, 'Choisissez une catégorie.'),
    groupId: z.string().nullish().transform((v) => v || null),
    variants: z
      .array(variantSchema, { required_error: 'Ajoutez au moins une formule avec son prix.' })
      .min(1, 'Ajoutez au moins une formule avec son prix.')
      .max(8, '8 formules au plus.'),
  })
  .superRefine((p, ctx) => {
    if (p.choices.length && !p.choiceLabel) {
      ctx.addIssue({ code: 'custom', path: ['choiceLabel'], message: 'Indiquez la question posée au client (ex. « Cuisson du poulet »).' });
    }
    if (p.choices.length === 1) {
      ctx.addIssue({ code: 'custom', path: ['choices'], message: 'Un choix demande au moins deux possibilités.' });
    }
    const labels = p.variants.map((v) => v.label.toLowerCase());
    if (new Set(labels).size !== labels.length) {
      ctx.addIssue({ code: 'custom', path: ['variants'], message: 'Deux formules portent le même nom.' });
    }
  })
  .transform((p) => (p.choices.length ? p : { ...p, choiceLabel: null }));

const groupSchema = z.object({
  id: z.string().max(40).optional(),
  name: text(60, 'Nom de la section').min(1, 'Donnez un nom à chaque section.'),
  note: optionalText(60, 'Précision de la section'),
});

export const categorySchema = z
  .object({
    name: text(60, 'Nom').min(1, 'Indiquez le nom de la catégorie.'),
    script: optionalText(40, 'Petit titre'),
    description: optionalText(300, 'Description'),
    isActive: z.boolean().default(true),
    groups: z.array(groupSchema).max(12, '12 sections au plus.').default([]),
  })
  .superRefine((c, ctx) => {
    const names = c.groups.map((g) => g.name.toLowerCase());
    if (new Set(names).size !== names.length) {
      ctx.addIssue({ code: 'custom', path: ['groups'], message: 'Deux sections portent le même nom.' });
    }
  });

export const availabilitySchema = z.object({
  isAvailable: z.boolean({ required_error: 'Disponibilité manquante.', invalid_type_error: 'Disponibilité manquante.' }),
});

export const orderSchema = z.object({
  ids: z.array(z.string().max(40)).min(1).max(200),
});

// Le nouvel ordre doit contenir exactement les mêmes éléments que l'ordre actuel
export const sameItems = (current, ids) =>
  current.length === ids.length && new Set(ids).size === ids.length && ids.every((id) => current.includes(id));
