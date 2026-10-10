import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { staffApi } from '../api/client.js';

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

  const value = useMemo(
    () => ({
      ...state,
      retry: check,
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
    [state, check],
  );

  return <StaffContext.Provider value={value}>{children}</StaffContext.Provider>;
}

export const useStaff = () => useContext(StaffContext);

export const ROLE_LABEL = { PATRON: 'Patron', OPERATEUR: 'Opérateur', LIVREUR: 'Livreur', PRESTATAIRE: 'Prestataire', RESPONSABLE_LIVRAISON: 'Responsable livraison' };

// Lot 4 : le Prestataire fait tout ce que fait le Patron (même règle que l'API, roles.js)
export const isPatronLevel = (role) => role === 'PATRON' || role === 'PRESTATAIRE';
