import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMemberSchema, ownPasswordSchema, provisionalPasswordSchema, teamActionError } from '../src/services/team.js';
import { accessFor } from '../src/middlewares/staff-auth.js';

const patron = { id: 'p1', role: 'PATRON', isActive: true };
const agent = { id: 'o1', role: 'OPERATEUR', isActive: true };
const parti = { id: 'o2', role: 'OPERATEUR', isActive: false };

test('nouveau compte : nom, numéro normalisé, mot de passe provisoire de 8 caractères au moins', () => {
  const ok = createMemberSchema.parse({ name: '  Awa  ', phone: '76 12 34 56', password: 'provisoire' });
  assert.deepEqual(ok, { name: 'Awa', phone: '+22676123456', password: 'provisoire' });
  assert.throws(() => createMemberSchema.parse({ name: 'Awa', phone: '1234', password: 'provisoire' }), /Numéro de téléphone invalide/);
  assert.throws(() => createMemberSchema.parse({ name: 'A', phone: '76123456', password: 'provisoire' }), /Nom trop court/);
  assert.throws(() => createMemberSchema.parse({ name: 'Awa', phone: '76123456', password: 'court' }), /au moins 8/);
  assert.throws(() => provisionalPasswordSchema.parse({}), /mot de passe provisoire/);
});

test("changer son mot de passe : l'ancien est demandé, sauf s'il est provisoire", () => {
  assert.throws(() => ownPasswordSchema(false).parse({ newPassword: 'nouveau-mdp' }), /mot de passe actuel/);
  assert.ok(ownPasswordSchema(false).parse({ currentPassword: 'ancien-mdp', newPassword: 'nouveau-mdp' }));
  assert.ok(ownPasswordSchema(true).parse({ newPassword: 'nouveau-mdp' }));
  assert.throws(() => ownPasswordSchema(true).parse({ newPassword: '1234567' }), /au moins 8/);
});

test('page Équipe : le Patron gère les comptes Opérateur, ni le sien ni celui d’un autre Patron', () => {
  assert.equal(teamActionError(patron, agent, 'reset'), null);
  assert.equal(teamActionError(patron, agent, 'deactivate'), null);
  assert.match(teamActionError(patron, patron, 'deactivate'), /votre propre compte/);
  assert.match(teamActionError(patron, { id: 'p2', role: 'PATRON', isActive: true }, 'reset'), /Patron/);
});

test('page Équipe : un compte désactivé se réactive, mais ne se réinitialise ni ne se désactive', () => {
  assert.equal(teamActionError(patron, parti, 'reactivate'), null);
  assert.match(teamActionError(patron, parti, 'reset'), /désactivé/);
  assert.match(teamActionError(patron, parti, 'deactivate'), /désactivé/);
  assert.match(teamActionError(patron, agent, 'reactivate'), /déjà actif/);
});

test('mot de passe provisoire : tout est bloqué sauf « qui suis-je » et le changement de mot de passe', () => {
  const nouveau = { ...agent, mustChangePassword: true };
  assert.equal(accessFor(nouveau, []), 'mot-de-passe');
  assert.equal(accessFor(nouveau, ['PATRON', 'OPERATEUR']), 'mot-de-passe');
  assert.equal(accessFor(nouveau, [], { allowProvisional: true }), 'ok');
  assert.equal(accessFor({ ...agent, mustChangePassword: false }, []), 'ok');
});

test('un Opérateur n’a jamais accès à la page Équipe', () => {
  assert.equal(accessFor(agent, ['PATRON']), 'refuse');
  assert.equal(accessFor(patron, ['PATRON']), 'ok');
});
