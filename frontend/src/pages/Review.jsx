import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../api/client.js';
import { RESTAURANT, whatsappHref } from '../restaurant.js';

// Lot 7 : page publique « Donnez votre avis » (/avis/:token), ouverte depuis le message de remerciement.
// Légère pour le téléphone : pas d'en-tête du site, pas de menu à télécharger. Le serveur ne renvoie que
// le prénom, la référence et s'il y a eu une livraison ; jamais le téléphone ni les montants.
const WORDS = ['Très mauvais', 'Mauvais', 'Moyen', 'Bien', 'Excellent'];
const COMMENT_MAX = 500;

function Stars({ id, label, help, value, onChange }) {
  return (
    <div className="rv-q">
      <div className="rv-q-head" id={`rv-${id}`}><b>{label}</b><span>{help}</span></div>
      <div className="rv-stars" role="radiogroup" aria-labelledby={`rv-${id}`}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={value === n}
            aria-label={`${n} étoile${n > 1 ? 's' : ''} : ${WORDS[n - 1]}`}
            className={value >= n ? 'on' : undefined}
            onClick={() => onChange(n)}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.6l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.5l-5.9 3.1 1.2-6.5L2.5 9.5l6.6-.9z" /></svg>
          </button>
        ))}
      </div>
      <div className="rv-word" aria-live="polite">{value ? WORDS[value - 1] : ' '}</div>
    </div>
  );
}

const contactHref = (reference) => whatsappHref(RESTAURANT.whatsapp, reference ? `Bonjour, je vous contacte au sujet de ma commande ${reference}.` : '');

function Shell({ children }) {
  return (
    <div className="rv">
      <header className="rv-top">
        <span className="mark"><span>B</span></span>
        <span><b>Belchicken</b><small>Votre avis</small></span>
      </header>
      <main className="rv-main">{children}</main>
    </div>
  );
}

function Message({ title, text, reference }) {
  return (
    <Shell>
      <section className="rv-card rv-done">
        <h1>{title}</h1>
        <p>{text}</p>
        <a className="btn btn-s btn-block" href={contactHref(reference)} target="_blank" rel="noreferrer">Nous contacter sur WhatsApp</a>
        <a className="btn btn-p btn-block" href="/menu">Voir le menu</a>
      </section>
    </Shell>
  );
}

export default function Review() {
  const { token } = useParams();
  const [page, setPage] = useState({ status: 'loading' });
  const [notes, setNotes] = useState({ callCenter: 0, food: 0, delivery: 0 });
  const [comment, setComment] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    document.title = 'Votre avis · Belchicken Burkina';
    api.getReview(token).then(
      (review) => setPage({ status: 'ready', review }),
      (e) => setPage({ status: 'error', error: e }),
    );
  }, [token]);

  if (page.status === 'loading') return <Shell><p className="rv-wait">Chargement…</p></Shell>;
  if (page.status === 'error') {
    const missing = page.error.status === 404;
    return (
      <Message
        title={missing ? 'Lien introuvable' : 'Page indisponible'}
        text={missing ? 'Ce lien d’avis n’existe pas. Vérifiez qu’il est complet, ou écrivez-nous sur WhatsApp.' : page.error.message}
      />
    );
  }

  const { review } = page;
  if (review.state === 'DEJA_DONNE') {
    return <Message reference={review.reference} title={`Merci${review.firstName ? ` ${review.firstName}` : ''} !`} text="Votre avis est bien enregistré. Il nous aide à mieux vous servir. À bientôt chez Belchicken Burkina !" />;
  }
  if (review.state === 'EXPIRE') {
    return <Message reference={review.reference} title="Lien expiré" text="Les avis se donnent dans les 7 jours qui suivent la commande. Pour nous dire quelque chose, écrivez-nous sur WhatsApp." />;
  }
  if (review.state === 'FERME') {
    return <Message reference={review.reference} title="Avis indisponibles" text="Les avis ne sont plus recueillis pour le moment. Pour nous dire quelque chose, écrivez-nous sur WhatsApp." />;
  }

  const questions = [
    { key: 'callCenter', label: 'Le call center', help: 'Accueil, rapidité, paiement' },
    { key: 'food', label: 'Le restaurant', help: 'Goût, quantité, présentation' },
    ...(review.delivery ? [{ key: 'delivery', label: 'La livraison', help: 'Délai, livreur, état de la commande' }] : []),
  ];
  const missing = questions.filter((q) => !notes[q.key]);

  const send = async (e) => {
    e.preventDefault();
    if (missing.length) {
      setError(`Choisissez une note pour : ${missing.map((q) => q.label.toLowerCase()).join(', ')}.`);
      return;
    }
    setSending(true);
    setError(null);
    try {
      const body = { callCenter: notes.callCenter, food: notes.food, comment: comment.trim() || null, ...(review.delivery ? { delivery: notes.delivery } : {}) };
      setPage({ status: 'ready', review: await api.sendReview(token, body) });
      window.scrollTo(0, 0);
    } catch (err) {
      // Déjà donné, lien expiré, avis fermés : le serveur l'explique, on affiche l'écran qui va avec
      if (['AVIS_DEJA_DONNE', 'AVIS_EXPIRE', 'AVIS_FERMES'].includes(err.code)) {
        const state = { AVIS_DEJA_DONNE: 'DEJA_DONNE', AVIS_EXPIRE: 'EXPIRE', AVIS_FERMES: 'FERME' }[err.code];
        setPage({ status: 'ready', review: { ...review, state } });
      } else setError(err.message);
    } finally {
      setSending(false);
    }
  };

  return (
    <Shell>
      <form className="rv-card" onSubmit={send} noValidate>
        <h1>Bonjour{review.firstName ? ` ${review.firstName}` : ''} !</h1>
        <p className="rv-lead">
          Comment s’est passée votre commande <b>{review.reference}</b>{review.delivery ? '' : ' à emporter'} ? Touchez les étoiles, cela prend une minute.
        </p>
        {questions.map((q) => (
          <Stars key={q.key} id={q.key} label={q.label} help={q.help} value={notes[q.key]} onChange={(n) => setNotes((s) => ({ ...s, [q.key]: n }))} />
        ))}
        <label className="rv-comment">
          <b>Un commentaire ?</b> <span>(facultatif)</span>
          <textarea value={comment} maxLength={COMMENT_MAX} rows={4} onChange={(e) => setComment(e.target.value)} placeholder="Ce qui vous a plu, ce que nous pouvons améliorer…" />
          <small>{comment.length} / {COMMENT_MAX}</small>
        </label>
        {error && <p className="rv-err" role="alert">{error}</p>}
        <button className="btn btn-p btn-block" type="submit" disabled={sending}>{sending ? 'Envoi…' : 'Envoyer mon avis'}</button>
        <p className="rv-foot">Un seul avis par commande. Votre numéro n’est jamais affiché.</p>
      </form>
    </Shell>
  );
}
