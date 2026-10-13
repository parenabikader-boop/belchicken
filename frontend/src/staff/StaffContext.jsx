import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { staffApi } from '../api/client.js';
import { afterRecheck } from './session.js';

const StaffContext = createContext(null);

// Compte connecté de l'espace équipe.
// status : 'loading' (vérification de la session), 'anon' (non connecté), 'ready' (connecté), 'error' (API injoignable)
// features (lot 4) : fonctions ouvertes par le Prestataire ({ CAISSE: true, … }). L'API les vérifie aussi.
export function StaffProvider({ children }) {
  const [state, setState] = useState({ status: 'loading', user: null, error: null, features: {} });

  const check = useCallback(() => {
    setState({ status: 'loading', user: null, error: null, features: {} });
    staffApi.me().then(
      ({ user, features }) => setState({ status: 'ready', user, error: null, features: features || {} }),
      (error) => setState(error.status === 401 ? { status: 'anon', user: null, error: null, features: {} } : { status: 'error', user: null, error, features: {} }),
    );
  }, []);

  useEffect(check, [check]);

  // Revérification en arrière-plan (correctif du 13 octobre 2026) : une demande automatique refusée (401, par
  // exemple le rechargement des commandes toutes les 5 s) ne doit JAMAIS effacer l'écran ni fermer une fenêtre
  // ouverte. On redemande « qui suis-je » sans toucher à l'affichage : session bonne = rien ne bouge (compte et
  // fonctions mis à jour) ; session vraiment terminée (401) = page de connexion ; serveur injoignable = on garde
  // l'écran, la demande suivante réessaiera. Avant la première vérification, c'est la vérification normale.
  const rechecking = useRef(false);
  const ready = state.status === 'ready';
  const recheck = useCallback(() => {
    if (!ready) return check();
    if (rechecking.current) return undefined;
    rechecking.current = true;
    return staffApi.me().then(
      (me) => setState((s) => afterRecheck(s, { me })),
      (error) => setState((s) => afterRecheck(s, { error })),
    ).finally(() => {
      rechecking.current = false;
    });
  }, [ready, check]);

  const value = useMemo(
    () => ({
      ...state,
      retry: check, // bouton « Réessayer » de l'écran d'erreur, à l'ouverture
      recheck, // demandes automatiques refusées : sans effacer l'écran
      // Renvoie { codeRequired: true } pour le compte Prestataire : le code est demandé ensuite (loginCode)
      login: async (phone, password) => {
        const data = await staffApi.login(phone, password);
        if (data.codeRequired) return { codeRequired: true };
        check();
        return {};
      },
      loginCode: async (code) => {
        await staffApi.loginCode(code);
        check();
      },
      // Après un changement de mot de passe : le compte renvoyé par l'API (mustChangePassword à faux)
      setUser: (user) => setState((s) => ({ ...s, status: 'ready', user, error: null })),
      // Page Prestataire : fonctions ouvertes après un changement d'interrupteur
      setFeatures: (list) => setState((s) => ({ ...s, features: Object.fromEntries(list.map((f) => [f.key, f.enabled])) })),
      // Fonction ouverte ? (inconnue = ouverte, comme l'API sans ligne en base)
      hasFeature: (key) => state.features[key] !== false,
      logout: async () => {
        // Même si l'API ne répond pas, on oublie la session côté écran
        await staffApi.logout().catch(() => {});
        setState({ status: 'anon', user: null, error: null, features: {} });
      },
    }),
    [state, check, recheck],
  );

  return <StaffContext.Provider value={value}>{children}</StaffContext.Provider>;
}

export const useStaff = () => useContext(StaffContext);

export const ROLE_LABEL = { PATRON: 'Patron', OPERATEUR: 'Opérateur', LIVREUR: 'Livreur', PRESTATAIRE: 'Prestataire', RESPONSABLE_LIVRAISON: 'Responsable livraison' };

// Lot 4 : le Prestataire fait tout ce que fait le Patron (même règle que l'API, roles.js)
export const isPatronLevel = (role) => role === 'PATRON' || role === 'PRESTATAIRE';
