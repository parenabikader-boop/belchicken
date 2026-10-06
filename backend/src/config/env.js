import 'dotenv/config';

const list = (v) => (v || '').split(',').map((s) => s.trim()).filter(Boolean);

export const env = {
  port: Number(process.env.PORT) || 3006,
  isProd: process.env.NODE_ENV === 'production',
  corsOrigins: list(process.env.CORS_ORIGINS || 'http://localhost:5173'),
  whatsapp: {
    token: process.env.WHATSAPP_TOKEN || '',
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID || '',
    apiVersion: process.env.WHATSAPP_API_VERSION || 'v21.0',
    templateNewOrder: process.env.WHATSAPP_TEMPLATE_NEW_ORDER || 'nouvelle_commande',
    templateLang: process.env.WHATSAPP_TEMPLATE_LANG || 'fr',
    teamNumbers: list(process.env.WHATSAPP_TEAM_NUMBERS),
    // Messages au client envoyés tout seuls par l'API (à chaque étape de la commande). Laisser vide
    // tant que les modèles de src/services/customer-messages.js ne sont pas approuvés chez Meta.
    customerAuto: process.env.WHATSAPP_CUSTOMER_AUTO === '1',
  },
  // Adresse du site public : lien de suivi envoyé au client (/suivi/BC-XXXXXX)
  siteUrl: process.env.PUBLIC_SITE_URL || 'https://belchicken-six.vercel.app',
  // Numéros marchands donnés au client pour les frais de livraison (messages et page de suivi).
  // Les mêmes que dans frontend/src/restaurant.js. MERCHANT_NUMBER (ancien réglage, un seul numéro) sert
  // si le numéro d'un opérateur est vide. EN ATTENTE du client : +22670000000 est provisoire.
  orangeMoneyNumber: process.env.ORANGE_MONEY_NUMBER || process.env.MERCHANT_NUMBER || '+22670000000',
  moovMoneyNumber: process.env.MOOV_MONEY_NUMBER || process.env.MERCHANT_NUMBER || '+22670000000',
  // Adresse du restaurant et lien Google Maps (Plus Code 9F2J+V8 Ouagadougou), pour le message
  // « commande prête » des commandes à emporter. Jamais la boîte postale.
  restaurantAddress:
    process.env.RESTAURANT_ADDRESS ||
    'Kamsonghin, en face de Sonia Hôtel : https://www.google.com/maps/dir/?api=1&destination=12.352187,-1.519188',
  cloudinary: {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME || '',
    apiKey: process.env.CLOUDINARY_API_KEY || '',
    apiSecret: process.env.CLOUDINARY_API_SECRET || '',
    folder: process.env.CLOUDINARY_FOLDER || 'belchicken',
  },
  // Notifications de l'équipe (Web Push). Le sujet est une adresse https ou mailto: qui identifie
  // l'expéditeur auprès de Google et Apple.
  push: {
    publicKey: process.env.VAPID_PUBLIC_KEY || '',
    privateKey: process.env.VAPID_PRIVATE_KEY || '',
    subject: process.env.VAPID_SUBJECT || 'https://belchicken-api.onrender.com',
  },
};

export const whatsappEnabled = () =>
  Boolean(env.whatsapp.token && env.whatsapp.phoneNumberId && env.whatsapp.teamNumbers.length);

// Envoi automatique des messages au client : l'API WhatsApp configurée ET l'option activée
export const customerAutoEnabled = () => Boolean(env.whatsapp.token && env.whatsapp.phoneNumberId && env.whatsapp.customerAuto);

// Ce dont les messages au client ont besoin (lien de suivi, numéros marchands, adresse du restaurant)
export const messageContext = () => ({
  siteUrl: env.siteUrl,
  orangeMoneyNumber: env.orangeMoneyNumber,
  moovMoneyNumber: env.moovMoneyNumber,
  restaurantAddress: env.restaurantAddress,
});

export const cloudinaryEnabled = () =>
  Boolean(env.cloudinary.cloudName && env.cloudinary.apiKey && env.cloudinary.apiSecret);

export const pushEnabled = () => Boolean(env.push.publicKey && env.push.privateKey);
