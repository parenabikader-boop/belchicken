import { PageHead, TunnelHead } from '../components/PageParts.jsx';

// Temporaire : remplacé page par page pendant la construction du frontend.
// step : étape du tunnel de commande, si la page en fait partie.
export default function Placeholder({ title, step }) {
  const empty = <div className="empty-page"><h2>Page en construction</h2><p>Cette page arrive à l'étape suivante.</p></div>;
  if (step != null) {
    return <div className="wrap pagebody tunnel-body"><TunnelHead title={title} step={step} />{empty}</div>;
  }
  return (
    <>
      <PageHead crumbs={[{ label: 'Accueil', to: '/' }, { label: title }]} title={title} />
      <div className="wrap pagebody">{empty}</div>
    </>
  );
}
