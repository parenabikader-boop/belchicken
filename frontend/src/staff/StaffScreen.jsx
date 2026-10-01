// Écran centré, sans en-tête : connexion, chargement
export function StaffScreen({ children }) {
  return (
    <div className="st-screen">
      <div className="st-card">
        <div className="st-brand"><span className="mark"><span>B</span></span><span><b>Belchicken</b><small>Espace équipe</small></span></div>
        {children}
      </div>
    </div>
  );
}
