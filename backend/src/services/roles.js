// Rôles de l'espace équipe (lot 4). Le Prestataire fait tout ce que fait le Patron, plus les interrupteurs
// des fonctions (page Prestataire). Toute règle « Patron seulement » passe par isPatronLevel() : un endroit
// oublié donne au Prestataire moins de droits, jamais plus.
export const isPatronLevel = (role) => role === 'PATRON' || role === 'PRESTATAIRE';
export const isPrestataire = (user) => user?.role === 'PRESTATAIRE';
