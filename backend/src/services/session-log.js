// Journal des refus de session (401) de l'espace équipe (correctif du 13 octobre 2026), testé dans
// test/session-log.test.js. But : trouver pourquoi le vrai site répond parfois « non connecté » à une demande
// automatique alors que la session est bonne. Une ligne par refus dans le journal de Render.
// JAMAIS la clé de session ni son empreinte : seulement la raison, l'adresse, le nombre de cookies de session reçus,
// et, si la session existe, son identifiant (sans valeur secrète) et ses dates.

// Pourquoi une session est refusée : null = acceptée
export function sessionRefusal(session, now = new Date()) {
  if (!session) return 'session-inconnue';
  if (session.expiresAt <= now) return 'session-expiree';
  if (!session.user?.isActive) return 'compte-desactive';
  return null;
}

const REASON_TEXT = {
  'sans-cookie': 'aucun cookie de session reçu',
  'session-inconnue': 'cookie reçu, session inconnue (supprimée ou jamais créée)',
  'session-expiree': 'session expirée',
  'compte-desactive': 'compte désactivé',
};

// Nombre de cookies « bc_equipe » dans l'en-tête (2 ou plus = deux sessions envoyées en même temps)
export function countSessionCookies(header, name = 'bc_equipe') {
  return (header || '').split(';').filter((part) => part.split('=')[0].trim() === name).length;
}

// Navigateur en quelques mots (Edge, Chrome, Safari, Firefox), sans le reste de l'en-tête
export function browserName(ua = '') {
  if (/Edg\//.test(ua)) return 'Edge';
  if (/OPR\//.test(ua)) return 'Opera';
  if (/Chrome\//.test(ua)) return 'Chrome';
  if (/Firefox\//.test(ua)) return 'Firefox';
  if (/Safari\//.test(ua)) return 'Safari';
  return ua ? 'autre' : 'inconnu';
}

const iso = (d) => (d ? new Date(d).toISOString().slice(0, 16).replace('T', ' ') : '—');

export function unauthorizedLine({ method, url, reason, cookieHeader, userAgent, session, now = new Date() }) {
  const path = (url || '').split('?')[0];
  const parts = [
    `[session] 401 ${method} ${path}`,
    REASON_TEXT[reason] || reason,
    `cookies de session reçus : ${countSessionCookies(cookieHeader)}`,
    `navigateur : ${browserName(userAgent)}`,
  ];
  if (session) {
    parts.push(
      `session ${session.id} de ${session.user?.name || '?'} (${session.user?.role || '?'}), ouverte ${iso(session.createdAt)}, ` +
        `vue ${iso(session.lastSeenAt)}, expire ${iso(session.expiresAt)}`,
    );
  }
  parts.push(`à ${iso(now)} UTC`);
  return parts.join(' · ');
}
