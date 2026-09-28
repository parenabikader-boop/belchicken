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

// Barre d'étapes compacte du tunnel de commande
export function Progress({ step }) {
  return (
    <ol className="progress" aria-label="Progression">
      {STEPS.map((t, i) => (
        <li key={t} className={i < step ? 'done' : i === step ? 'cur' : undefined} aria-current={i === step ? 'step' : undefined}>
          <span className="k">{i + 1}.</span> {t}
        </li>
      ))}
    </ol>
  );
}

// Titre simple des pages du tunnel (Ma commande, Vos informations, Confirmation),
// suivi de la barre d'étapes quand step est fourni.
export function TunnelHead({ title, step, children }) {
  return (
    <div className="tunnel-head">
      <h1>{title}</h1>
      {children && <p>{children}</p>}
      {step != null && <Progress step={step} />}
    </div>
  );
}
