// Revérification de la session en arrière-plan (correctif du 13 octobre 2026), testée dans session.test.js.
// État de StaffContext.jsx : { status: 'loading' | 'anon' | 'ready' | 'error', user, error, features }.
// L'écran n'est jamais effacé : seul un vrai « non connecté » (401) renvoie à la page de connexion.

// me : réponse de GET /api/staff/me ({ user, features }) ; error : erreur de la demande (sinon null)
export function afterRecheck(state, { me = null, error = null }) {
  if (me) return { ...state, status: 'ready', user: me.user, error: null, features: me.features || {} };
  if (error?.status === 401) return { status: 'anon', user: null, error: null, features: {} };
  return state; // serveur lent ou injoignable, erreur 500 ou 503 : on garde l'écran tel quel
}
