// Règles de la page Équipe et des changements de mot de passe, sans base de données
// (testées dans test/team.test.js). Les accès à la base sont dans team.service.js.
import { z } from 'zod';
import { normalizePhone } from '../utils/phone.js';
import { PASSWORD_MIN_LENGTH } from './staff-auth.js';

const password = (label, min = PASSWORD_MIN_LENGTH) =>
  z
    .string({ required_error: `Indiquez ${label}.` })
    .min(min, `Mot de passe trop court : au moins ${min} caractères.`)
    .max(200, 'Mot de passe trop long.');

// Comptes créés depuis la page Équipe (les Patrons : npm run equipe:patron)
export const MEMBER_ROLES = ['OPERATEUR', 'LIVREUR'];

// Nouveau compte Opérateur ou Livreur : le mot de passe donné est provisoire
export const createMemberSchema = z.object({
  role: z.enum(MEMBER_ROLES, { errorMap: () => ({ message: 'Choisissez le rôle : Opérateur ou Livreur.' }) }).default('OPERATEUR'),
  name: z
    .string({ required_error: 'Indiquez le nom.' })
    .trim()
    .min(2, 'Nom trop court.')
    .max(60, 'Nom trop long (60 caractères au plus).'),
  phone: z
    .string({ required_error: 'Indiquez le numéro de téléphone.' })
    .max(30)
    .transform((v, ctx) => {
      const phone = normalizePhone(v);
      if (!phone) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Numéro de téléphone invalide. Exemple : 76 12 34 56' });
        return z.NEVER;
      }
      return phone;
    }),
  password: password('le mot de passe provisoire'),
});

// Réinitialisation ou réactivation par le Patron : nouveau mot de passe provisoire
export const provisionalPasswordSchema = z.object({ password: password('le mot de passe provisoire') });

// Changement de son propre mot de passe. L'ancien est demandé, sauf quand le mot de passe actuel
// est provisoire : le membre vient de le taper pour se connecter.
// Lot 4, Prestataire : 12 caractères au moins (min), et son code à 6 chiffres (code, vérifié ensuite).
export const ownPasswordSchema = (mustChange, min) =>
  z.object({
    currentPassword: mustChange
      ? z.string().max(200).optional()
      : z.string({ required_error: 'Indiquez votre mot de passe actuel.' }).min(1, 'Indiquez votre mot de passe actuel.').max(200),
    newPassword: password('le nouveau mot de passe', min),
    code: min
      ? z.string({ required_error: 'Tapez le code à 6 chiffres de votre application.' }).min(1, 'Tapez le code à 6 chiffres de votre application.').max(40)
      : z.string().max(40).optional(),
  });

// Ce que le Patron peut faire sur un compte depuis la page Équipe.
// Renvoie null si c'est permis, sinon le message à afficher.
//   action : 'reset' (nouveau mot de passe provisoire), 'deactivate', 'reactivate'
export function teamActionError(actor, target, action) {
  if (target.id === actor.id) return 'Pour votre propre compte, utilisez « Mon mot de passe ».';
  // Lot 4 : le compte Prestataire ne se gère qu'avec npm run equipe:prestataire
  if (target.role === 'PRESTATAIRE') return 'Le compte Prestataire ne se modifie pas depuis cette page.';
  // Un compte Patron ne se gère qu'avec npm run equipe:patron : un Patron ne peut pas en bloquer un autre
  if (!MEMBER_ROLES.includes(target.role)) return "Le compte d'un Patron ne se modifie pas depuis cette page.";
  if (action === 'reactivate') return target.isActive ? 'Ce compte est déjà actif.' : null;
  if (!target.isActive) return 'Ce compte est désactivé. Réactivez-le en lui donnant un mot de passe provisoire.';
  return null;
}
