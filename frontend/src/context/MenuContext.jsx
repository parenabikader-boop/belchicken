import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from '../api/client.js';

const MenuContext = createContext(null);

// Charge le menu une seule fois (GET /api/menu) et le partage entre les pages.
export function MenuProvider({ children }) {
  const [state, setState] = useState({ status: 'loading', categories: [], error: null });

  const load = useCallback(() => {
    setState((s) => ({ ...s, status: 'loading', error: null }));
    api
      .getMenu()
      .then((categories) => setState({ status: 'ready', categories, error: null }))
      .catch((error) => setState({ status: 'error', categories: [], error }));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const value = useMemo(() => {
    const products = new Map();
    for (const c of state.categories) for (const p of c.products) products.set(p.id, { ...p, category: c });
    return { ...state, products, reload: load };
  }, [state, load]);

  return <MenuContext.Provider value={value}>{children}</MenuContext.Provider>;
}

export const useMenu = () => useContext(MenuContext);
