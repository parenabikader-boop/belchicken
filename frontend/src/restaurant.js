// Informations du restaurant affichées sur le site (un seul endroit à modifier).
// Les codes marchands mobile money ne sont pas ici : ils viennent du serveur (utils/payment.js).

export const RESTAURANT = {
  name: 'Belchicken Burkina',
  city: 'Ouagadougou',
  address: 'Kamsonghin, en face de Sonia Hôtel',
  // Numéro du restaurant (informations de contact, comme sur les tickets de caisse)
  phone: '+226 62 88 42 88',
  // WhatsApp du call center : commandes et suivi (boutons « Nous contacter sur WhatsApp »)
  whatsapp: '+226 05 23 48 48',
  // Plus Code 9F2J+V8 Ouagadougou (= 7C4W9F2J+V8), centre du carré de 14 m
  plusCode: '9F2J+V8 Ouagadougou',
  latitude: 12.352187,
  longitude: -1.519188,
};

// Bouton « Itinéraire » : Google Maps calcule le trajet jusqu'au restaurant
export const DIRECTIONS_URL = `https://www.google.com/maps/dir/?api=1&destination=${RESTAURANT.latitude},${RESTAURANT.longitude}`;

export const telHref = (phone) => `tel:${phone.replace(/\s/g, '')}`;
export const whatsappHref = (phone, text) =>
  `https://wa.me/${phone.replace(/\D/g, '')}${text ? `?text=${encodeURIComponent(text)}` : ''}`;

// Horaires (heure de Ouagadougou = UTC toute l'année) : dimanche à jeudi 6 h – 23 h,
// vendredi et samedi 24 h/24
export const HOURS = [
  { days: 'Dimanche – jeudi', time: '6 h – 23 h' },
  { days: 'Vendredi – samedi', time: '24 h/24' },
];
const OPEN_ALL_DAY = [5, 6]; // vendredi, samedi (getUTCDay)
const OPENS = 6;
const CLOSES = 23;

const isOpenAt = (day, hour) => OPEN_ALL_DAY.includes(day) || (hour >= OPENS && hour < CLOSES);

// Bandeau du haut : { open, text }
export function openStatus(now = new Date()) {
  const day = now.getUTCDay();
  const hour = now.getUTCHours();
  if (isOpenAt(day, hour)) {
    if (OPEN_ALL_DAY.includes(day)) {
      // Samedi : ouvert jusqu'à minuit, puis réouverture dimanche à 6 h
      return { open: true, text: day === 6 ? 'ouvert 24 h/24 aujourd’hui, jusqu’à minuit' : 'ouvert 24 h/24 aujourd’hui' };
    }
    // Jeudi soir : fermeture à 23 h, réouverture à minuit (vendredi 24 h/24)
    return { open: true, text: `jusqu’à ${CLOSES} h` };
  }
  // Fermé : jeudi de 23 h à minuit (réouverture à minuit), sinon réouverture à 6 h
  return { open: false, text: day === 4 && hour >= CLOSES ? 'réouverture à minuit' : `réouverture à ${OPENS} h` };
}
