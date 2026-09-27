import { Fragment } from 'react';
import { Link } from 'react-router-dom';

// Bandeau rouge en haut des pages intérieures.
// crumbs : [{ label, to }] ; le dernier élément, sans lien, est la page courante.
export function PageHead({ crumbs, title, children }) {
  return (
    <section className="pagehead">
      <div className="wrap">
        <div className="crumb">
          {crumbs.map((c, i) => (
            <Fragment key={i}>
              {i > 0 && ' › '}
              {c.to ? <Link to={c.to}>{c.label}</Link> : c.label}
            </Fragment>
          ))}
        </div>
        <h1>{title}</h1>
        {children && <p>{children}</p>}
      </div>
    </section>
  );
}

const STEPS = ['Choix des plats', 'Vérification', 'Informations', 'Confirmation'];

export function Progress({ step }) {
  return (
    <div className="progress" aria-label="Progression">
      {STEPS.map((t, i) => (
        <div key={t} className={i < step ? 'done' : i === step ? 'cur' : undefined} aria-current={i === step ? 'step' : undefined}>
          <b>Étape {i + 1}</b>{t}
        </div>
      ))}
    </div>
  );
}
