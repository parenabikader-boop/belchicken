import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { staffApi } from '../../api/client.js';
import { useStaff } from '../StaffContext.jsx';

// Fil des commandes en cours, partagé par toutes les pages de l'espace équipe :
// interroge l'API toutes les 5 s (30 s quand l'onglet est caché), repère les nouvelles
// commandes, joue un son, fait vibrer le téléphone et compte les commandes pas encore ouvertes.

const POLL_VISIBLE_MS = 5000;
const POLL_HIDDEN_MS = 30000;

const OrdersFeedContext = createContext(null);

// Son de notification fabriqué par le navigateur (deux notes), sans fichier audio.
// Les navigateurs n'autorisent le son qu'après un premier geste de l'utilisateur : on prépare
// le lecteur au premier toucher ou clic sur la page.
export function useChime() {
  const ctxRef = useRef(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const unlock = () => {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      ctxRef.current ??= new AudioCtx();
      ctxRef.current.resume().then(() => setReady(ctxRef.current.state === 'running'));
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, []);

  const play = useCallback(() => {
    navigator.vibrate?.([200, 100, 200]);
    const ctx = ctxRef.current;
    if (!ctx || ctx.state !== 'running') return;
    const t = ctx.currentTime;
    [880, 1320].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, t + i * 0.22);
      gain.gain.exponentialRampToValueAtTime(0.4, t + i * 0.22 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.22 + 0.35);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t + i * 0.22);
      osc.stop(t + i * 0.22 + 0.4);
    });
  }, []);

  return { play, soundReady: ready };
}

export function OrdersFeedProvider({ children }) {
  const { retry: recheckSession } = useStaff();
  const { play, soundReady } = useChime();
  const [feed, setFeed] = useState({ orders: null, counts: {}, error: null, updatedAt: null });
  // Commandes arrivées pendant la session et pas encore ouvertes
  const [unseen, setUnseen] = useState(() => new Set());
  const known = useRef(null);
  const knownThanks = useRef(null); // livrées à remercier déjà vues
  const timer = useRef(null);
  const inFlight = useRef(false);

  const poll = useCallback(async () => {
    clearTimeout(timer.current);
    if (inFlight.current) return; // une requête est déjà en cours : elle reprogrammera la suivante
    inFlight.current = true;
    try {
      const data = await staffApi.orders({ status: 'EN_COURS' });
      const refs = data.orders.map((o) => o.reference);
      // Commande livrée (par le livreur ou un collègue) : un son, comme une nouvelle commande
      const thanks = data.orders.filter((o) => o.toThank).map((o) => o.reference);
      const deliveredNow = knownThanks.current && thanks.some((r) => !knownThanks.current.has(r));
      knownThanks.current = new Set(thanks);
      if (known.current) {
        const fresh = data.orders.filter((o) => !known.current.has(o.reference) && o.status === 'PAIEMENT_A_VERIFIER');
        if (fresh.length) setUnseen((s) => new Set([...s, ...fresh.map((o) => o.reference)]));
        if (fresh.length || deliveredNow) play();
        refs.forEach((r) => known.current.add(r));
      } else {
        // Premier chargement : les commandes déjà là ne sont pas « nouvelles »
        known.current = new Set(refs);
      }
      setFeed({ orders: data.orders, counts: data.counts, error: null, updatedAt: Date.now() });
    } catch (error) {
      if (error.status === 401) {
        inFlight.current = false;
        return recheckSession(); // session expirée : retour à la connexion
      }
      setFeed((f) => ({ ...f, error }));
    }
    inFlight.current = false;
    timer.current = setTimeout(poll, document.hidden ? POLL_HIDDEN_MS : POLL_VISIBLE_MS);
  }, [play, recheckSession]);

  useEffect(() => {
    poll();
    // Retour sur l'onglet : mise à jour immédiate
    const onVisible = () => !document.hidden && poll();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearTimeout(timer.current);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [poll]);

  // Nombre de nouvelles commandes dans le titre de l'onglet
  useEffect(() => {
    const base = 'Belchicken · Espace équipe';
    document.title = unseen.size ? `(${unseen.size}) ${base}` : base;
  }, [unseen]);

  // Fonctions stables : les pages peuvent les mettre dans leurs dépendances sans boucler
  const markSeen = useCallback(
    (reference) =>
      setUnseen((s) => {
        if (!s.has(reference)) return s;
        const next = new Set(s);
        next.delete(reference);
        return next;
      }),
    [],
  );

  const value = useMemo(
    () => ({ ...feed, unseen, soundReady, refresh: poll, markSeen }),
    [feed, unseen, soundReady, poll, markSeen],
  );

  return <OrdersFeedContext.Provider value={value}>{children}</OrdersFeedContext.Provider>;
}

export const useOrdersFeed = () => useContext(OrdersFeedContext);
