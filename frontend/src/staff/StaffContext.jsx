import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { staffApi } from '../api/client.js';

const StaffContext = createContext(null);

// Compte connecté de l'espace équipe.
// status : 'loading' (vérification de la session), 'anon' (non connecté), 'ready' (connecté), 'error' (API injoignable)
export function StaffProvider({ children }) {
  const [state, setState] = useState({ status: 'loading', user: null, error: null });

  const check = useCallback(() => {
    setState({ status: 'loading', user: null, error: null });
    staffApi.me().then(
      (user) => setState({ status: 'ready', user, error: null }),
      (error) => setState(error.status === 401 ? { status: 'anon', user: null, error: null } : { status: 'error', user: null, error }),
    );
  }, []);

  useEffect(check, [check]);

  const value = useMemo(
    () => ({
      ...state,
      retry: check,
      login: async (phone, password) => {
        const user = await staffApi.login(phone, password);
        setState({ status: 'ready', user, error: null });
      },
      // Après un changement de mot de passe : le compte renvoyé par l'API (mustChangePassword à faux)
      setUser: (user) => setState({ status: 'ready', user, error: null }),
      logout: async () => {
        // Même si l'API ne répond pas, on oublie la session côté écran
        await staffApi.logout().catch(() => {});
        setState({ status: 'anon', user: null, error: null });
      },
    }),
    [state, check],
  );

  return <StaffContext.Provider value={value}>{children}</StaffContext.Provider>;
}

export const useStaff = () => useContext(StaffContext);

export const ROLE_LABEL = { PATRON: 'Patron', OPERATEUR: 'Opérateur' };
