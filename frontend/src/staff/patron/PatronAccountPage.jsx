import { useEffect, useState } from 'react';
import { canPromptInstall, isIos, isStandalone, promptInstall, subscribeInstall } from '../../pwa.js';
import { Link } from 'react-router-dom';
import { staffApi } from '../../api/client.js';
import { useStaff } from '../StaffContext.jsx';
import './patron.css';

// Compte Patron simplifié : « Mon compte » (rond en haut à droite) : alertes et résumés sur ce téléphone, heures des
// résumés, mot de passe, déconnexion. Résumé du soir : ventes, commandes, meilleur plat, note des avis ; résumé de la
// semaine : le lundi. Alertes : seulement les mauvais avis et les plats en rupture depuis plus de 24 heures.
const HOURS = Array.from({ length: 24 }, (_, h) => h);

// Lot B : installer « BC Patron » sur l'écran d'accueil (icône Belchicken, s'ouvre sur Comptes). Android : la fenêtre
// d'installation du téléphone ; iPhone : le petit guide ; déjà installée : rien.
function InstallApp() {
  const [, refresh] = useState(0);
  const [guide, setGuide] = useState(false);
  useEffect(() => subscribeInstall(() => refresh((n) => n + 1)), []);
  if (isStandalone()) return <p className="pc-ok">Application installée sur ce téléphone.</p>;
  if (canPromptInstall()) return <button type="button" className="btn btn-s" onClick={() => promptInstall()}>Installer l’application sur ce téléphone</button>;
  if (!isIos()) return <p className="pc-note">Pour installer l’application : menu du navigateur, puis « Installer l’application » ou « Ajouter à l’écran d’accueil ».</p>;
  return (
    <>
      <button type="button" className="btn btn-s" onClick={() => setGuide((g) => !g)}>Installer l’application sur ce téléphone</button>
      {guide && <p className="pc-note">Touchez le bouton Partager de Safari (carré avec une flèche), puis « Sur l’écran d’accueil ».</p>}
    </>
  );
}

export default function PatronAccountPage() {
  const { user, logout } = useStaff();
  const [form, setForm] = useState(null);
  const [missing, setMissing] = useState(false);
  const [state, setState] = useState({ busy: false, error: null, saved: false });

  useEffect(() => {
    staffApi.digestSettings().then(
      ({ missing: m, ...s }) => { setForm(s); setMissing(m); },
      (e) => setState({ busy: false, error: e.message, saved: false }),
    );
  }, []);

  const set = (k, v) => {
    setForm((f) => ({ ...f, [k]: v }));
    setState({ busy: false, error: null, saved: false });
  };
  const save = async (e) => {
    e.preventDefault();
    setState({ busy: true, error: null, saved: false });
    try {
      const { missing: m, ...s } = await staffApi.saveDigestSettings(form);
      setForm(s);
      setMissing(m);
      setState({ busy: false, error: null, saved: true });
    } catch (err) {
      setState({ busy: false, error: err.message, saved: false });
    }
  };

  return (
    <div className="pc pc-account">
      <section className="pc-card">
        <h2>{user.name}</h2>
        <p className="pc-note">Patron</p>
        <div className="pc-links">
          <Link className="btn btn-p" to="/equipe/alertes">Recevoir les résumés sur ce téléphone</Link>
          <InstallApp />
          <Link className="btn btn-s" to="/equipe/mot-de-passe">Mon mot de passe</Link>
          <button type="button" className="btn btn-s" onClick={logout}>Déconnexion</button>
        </div>
      </section>

      <section className="pc-card">
        <h2>Résumés sur votre téléphone</h2>
        {!form && !state.error && <p className="st-muted">Chargement…</p>}
        {missing && <p className="pc-note">Les heures ne peuvent pas encore être changées : votre prestataire doit d’abord mettre la base à jour.</p>}
        {form && (
          <form className="pc-digest" onSubmit={save}>
            <label className="pc-check">
              <input type="checkbox" checked={form.eveningOn} onChange={(e) => set('eveningOn', e.target.checked)} />
              <span><b>Résumé du soir</b><small>Ventes, commandes, meilleur plat, note des avis</small></span>
            </label>
            <label className="pc-hour">À
              <select value={form.eveningHour} onChange={(e) => set('eveningHour', Number(e.target.value))} disabled={!form.eveningOn}>
                {HOURS.map((h) => <option key={h} value={h}>{h} h{h < 6 ? ' (la journée d’avant)' : ''}</option>)}
              </select>
            </label>
            <label className="pc-check">
              <input type="checkbox" checked={form.weeklyOn} onChange={(e) => set('weeklyOn', e.target.checked)} />
              <span><b>Résumé de la semaine</b><small>Le lundi matin, sur la semaine finie</small></span>
            </label>
            <label className="pc-hour">Le lundi à
              <select value={form.weeklyHour} onChange={(e) => set('weeklyHour', Number(e.target.value))} disabled={!form.weeklyOn}>
                {HOURS.map((h) => <option key={h} value={h}>{h} h</option>)}
              </select>
            </label>
            <label className="pc-check">
              <input type="checkbox" checked={form.monthlyOn ?? true} onChange={(e) => set('monthlyOn', e.target.checked)} />
              <span><b>Rapport du mois</b><small>Le 1er du mois, à l’heure du résumé de la semaine</small></span>
            </label>
            <button type="submit" className="btn btn-p" disabled={state.busy || missing}>{state.busy ? 'Enregistrement…' : 'Enregistrer'}</button>
            {state.saved && <p className="pc-ok" role="status">Enregistré.</p>}
          </form>
        )}
        {state.error && <p className="pc-err" role="alert">{state.error}</p>}
        <p className="pc-note">Alertes importantes seulement : avis de 1 ou 2 étoiles (avec le commentaire) et plat en rupture depuis plus de 24 heures.</p>
      </section>
    </div>
  );
}
