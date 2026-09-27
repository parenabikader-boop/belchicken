import { PageHead } from '../components/PageParts.jsx';

// Temporaire : remplacé page par page pendant la construction du frontend
export default function Placeholder({ title }) {
  return (
    <>
      <PageHead crumbs={[{ label: 'Accueil', to: '/' }, { label: title }]} title={title} />
      <div className="wrap pagebody">
        <div className="empty-page"><h2>Page en construction</h2><p>Cette page arrive à l'étape suivante.</p></div>
      </div>
    </>
  );
}
