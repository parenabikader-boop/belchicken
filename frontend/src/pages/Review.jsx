import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../api/client.js';
import { RESTAURANT, whatsappHref } from '../restaurant.js';
import { LangSwitch, Rich, useT } from '../i18n/index.jsx';

// Lot 7 : page publique « Donnez votre avis » (/avis/:token), ouverte depuis le message de remerciement.
// Légère pour le téléphone : pas d'en-tête du site, pas de menu à télécharger. Le serveur ne renvoie que
// le prénom, la référence et s'il y a eu une livraison ; jamais le téléphone ni les montants.
// Mots des notes (« Très mauvais » … « Excellent ») : i18n, review.words
const COMMENT_MAX = 500;

function Stars({ id, label, help, value, onChange }) {
  const { review: R } = useT();
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
            aria-label={R.starAria(n, R.words[n - 1])}
            className={value >= n ? 'on' : undefined}
            onClick={() => onChange(n)}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.6l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.5l-5.9 3.1 1.2-6.5L2.5 9.5l6.6-.9z" /></svg>
          </button>
        ))}
      </div>
      <div className="rv-word" aria-live="polite">{value ? R.words[value - 1] : ' '}</div>
    </div>
  );
}

const contactHref = (reference) => whatsappHref(RESTAURANT.whatsapp, reference ? `Bonjour, je vous contacte au sujet de ma commande ${reference}.` : '');

function Shell({ children }) {
  const { review: R } = useT();
  return (
    <div className="rv">
      <header className="rv-top">
        <span className="mark"><span>B</span></span>
        <span><b>Belchicken</b><small>{R.subtitle}</small></span>
        <LangSwitch />
      </header>
      <main className="rv-main">{children}</main>
    </div>
  );
}

function Message({ title, text, reference }) {
  const t = useT();
  return (
    <Shell>
      <section className="rv-card rv-done">
        <h1>{title}</h1>
        <p>{text}</p>
        <a className="btn btn-s btn-block" href={contactHref(reference)} target="_blank" rel="noreferrer">{t.common.contactWhatsapp}</a>
        <a className="btn btn-p btn-block" href="/menu">{t.common.seeMenu}</a>
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
  const t = useT();
  const R = t.review;

  useEffect(() => {
    document.title = R.docTitle;
  }, [R]);

  useEffect(() => {
    api.getReview(token).then(
      (review) => setPage({ status: 'ready', review }),
      (e) => setPage({ status: 'error', error: e }),
    );
  }, [token]);

  if (page.status === 'loading') return <Shell><p className="rv-wait">{R.loading}</p></Shell>;
  if (page.status === 'error') {
    const missing = page.error.status === 404;
    return (
      <Message
        title={missing ? R.notFoundTitle : R.errorTitle}
        text={missing ? R.notFoundText : t.error(page.error)}
      />
    );
  }

  const { review } = page;
  if (review.state === 'DEJA_DONNE') {
    return <Message reference={review.reference} title={R.thanksTitle(review.firstName)} text={R.thanksText} />;
  }
  if (review.state === 'EXPIRE') {
    return <Message reference={review.reference} title={R.expiredTitle} text={R.expiredText} />;
  }
  if (review.state === 'FERME') {
    return <Message reference={review.reference} title={R.closedTitle} text={R.closedText} />;
  }

  const questions = [
    { key: 'callCenter' },
    { key: 'food' },
    ...(review.delivery ? [{ key: 'delivery' }] : []),
  ].map((q) => ({ ...q, label: R.questions[q.key][0], help: R.questions[q.key][1] }));
  const missing = questions.filter((q) => !notes[q.key]);

  const send = async (e) => {
    e.preventDefault();
    if (missing.length) {
      setError(R.missing(missing.map((q) => q.label.toLowerCase()).join(', ')));
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
      } else setError(t.error(err));
    } finally {
      setSending(false);
    }
  };

  return (
    <Shell>
      <form className="rv-card" onSubmit={send} noValidate>
        <h1>{R.hello(review.firstName)}</h1>
        <p className="rv-lead">
          <Rich text={R.lead} reference={review.reference} pickup={review.delivery ? '' : R.leadPickup} />
        </p>
        {questions.map((q) => (
          <Stars key={q.key} id={q.key} label={q.label} help={q.help} value={notes[q.key]} onChange={(n) => setNotes((s) => ({ ...s, [q.key]: n }))} />
        ))}
        <label className="rv-comment">
          <b>{R.comment}</b> <span>{t.common.optional}</span>
          <textarea value={comment} maxLength={COMMENT_MAX} rows={4} onChange={(e) => setComment(e.target.value)} placeholder={R.commentPh} />
          <small>{comment.length} / {COMMENT_MAX}</small>
        </label>
        {error && <p className="rv-err" role="alert">{error}</p>}
        <button className="btn btn-p btn-block" type="submit" disabled={sending}>{sending ? R.sending : R.send}</button>
        <p className="rv-foot">{R.foot}</p>
      </form>
    </Shell>
  );
}
