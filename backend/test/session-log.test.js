import { test } from 'node:test';
import assert from 'node:assert/strict';
import { browserName, countSessionCookies, sessionRefusal, unauthorizedLine } from '../src/services/session-log.js';

const NOW = new Date('2026-10-13T20:00:00Z');
const TOKEN = 'Zs3cr3t-session-token-abcdefghijklmnopqrstuvwxyz0123';
const session = (extra = {}) => ({
  id: 'cm9sessionid', expiresAt: new Date('2026-10-20T08:00:00Z'), lastSeenAt: new Date('2026-10-13T19:58:00Z'),
  createdAt: new Date('2026-10-06T08:00:00Z'), user: { name: 'Patron', role: 'PATRON', isActive: true }, ...extra,
});

test('raison du refus : inconnue, expirée, compte désactivé ; acceptée sinon', () => {
  assert.equal(sessionRefusal(null, NOW), 'session-inconnue');
  assert.equal(sessionRefusal(session({ expiresAt: new Date('2026-10-13T19:00:00Z') }), NOW), 'session-expiree');
  assert.equal(sessionRefusal(session({ user: { isActive: false } }), NOW), 'compte-desactive');
  assert.equal(sessionRefusal(session(), NOW), null);
});

test('cookies de session reçus : un, deux (doublon), aucun ; le cookie du code Prestataire ne compte pas', () => {
  assert.equal(countSessionCookies(`bc_equipe=${TOKEN}`), 1);
  assert.equal(countSessionCookies(`bc_equipe=a; theme=x; bc_equipe=b`), 2);
  assert.equal(countSessionCookies('bc_equipe_code=x'), 0);
  assert.equal(countSessionCookies(undefined), 0);
});

test('ligne du journal : raison, adresse sans paramètres, dates ; JAMAIS la clé de session', () => {
  const header = `theme=x; bc_equipe=${TOKEN}`;
  const line = unauthorizedLine({
    method: 'GET', url: '/api/staff/orders?status=EN_COURS', reason: 'session-expiree', cookieHeader: header,
    userAgent: 'Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/129.0 Safari/537.36 Edg/129.0', session: session(), now: NOW,
  });
  assert.match(line, /^\[session\] 401 GET \/api\/staff\/orders · session expirée · cookies de session reçus : 1 · navigateur : Edge/);
  assert.match(line, /session cm9sessionid de Patron \(PATRON\), ouverte 2026-10-06 08:00, vue 2026-10-13 19:58, expire 2026-10-20 08:00/);
  assert.ok(!line.includes(TOKEN) && !line.includes('Zs3cr3t') && !line.includes('EN_COURS'));
  const none = unauthorizedLine({ method: 'GET', url: '/api/staff/me', reason: 'sans-cookie', cookieHeader: '', userAgent: '', session: null, now: NOW });
  assert.match(none, /aucun cookie de session reçu · cookies de session reçus : 0 · navigateur : inconnu · à 2026-10-13 20:00 UTC$/);
});

test('navigateur en un mot', () => {
  assert.equal(browserName('… Chrome/129.0 Safari/537.36'), 'Chrome');
  assert.equal(browserName('… Version/17.0 Mobile/15E148 Safari/604.1'), 'Safari');
  assert.equal(browserName(''), 'inconnu');
});
