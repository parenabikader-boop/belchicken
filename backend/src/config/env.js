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
  // Paiement mobile money par code marchand (USSD), sans frais pour le client. MONTANT est remplacé par
  // le montant à payer (plats sur la page Vos informations, frais de livraison sur la page de suivi et
  // dans les messages). Modifiables sur Render sans toucher au code. Le site les lit par GET /api/payment.
  payment: {
    // Nom affiché sur la confirmation de paiement du client
    merchantName: process.env.MERCHANT_NAME || 'ECOFOOD',
    codes: {
      ORANGE_MONEY: process.env.ORANGE_MONEY_CODE || '*144*10*66534483*MONTANT#',
      MOOV_MONEY: process.env.MOOV_MONEY_CODE || '*555*4*1*1050194*MONTANT#',
      TELECEL_MONEY: process.env.TELECEL_MONEY_CODE || '*808*4*1*2331833*MONTANT#',
    },
  },
  // Adresse du restaurant et lien Google Maps « Itinéraire » (Plus Code 9F2J+V8 Ouagadougou), pour le
  // message « commande prête » des commandes à emporter. Les mêmes que frontend/src/restaurant.js.
  // Jamais la boîte postale.
  restaurantAddress: process.env.RESTAURANT_ADDRESS || 'Kamsonghin, en face de Sonia Hôtel',
  restaurantMapsUrl: process.env.RESTAURANT_MAPS_URL || 'https://www.google.com/maps/dir/?api=1&destination=12.352187,-1.519188',
  // Position du restaurant : point de départ des tranches de distance des frais de livraison
  restaurantPosition: {
    latitude: Number(process.env.RESTAURANT_LATITUDE) || 12.352187,
    longitude: Number(process.env.RESTAURANT_LONGITUDE) || -1.519188,
  },
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
  // Lot 4 : clé qui chiffre en base la clé du code à 6 chiffres du Prestataire (32 octets en base64).
  // Dans backend/.env et sur Render seulement. Vide = connexion du Prestataire impossible.
  prestataireTotpKey: process.env.PRESTATAIRE_TOTP_KEY || '',
};

export const whatsappEnabled = () =>
  Boolean(env.whatsapp.token && env.whatsapp.phoneNumberId && env.whatsapp.teamNumbers.length);

// Envoi automatique des messages au client : l'API WhatsApp configurée ET l'option activée
export const customerAutoEnabled = () => Boolean(env.whatsapp.token && env.whatsapp.phoneNumberId && env.whatsapp.customerAuto);

// Ce dont les messages au client ont besoin (lien de suivi, codes marchands, adresse du restaurant)
export const messageContext = () => ({
  siteUrl: env.siteUrl,
  payment: env.payment,
  restaurantAddress: env.restaurantAddress,
  restaurantMapsUrl: env.restaurantMapsUrl,
});

export const cloudinaryEnabled = () =>
  Boolean(env.cloudinary.cloudName && env.cloudinary.apiKey && env.cloudinary.apiSecret);

export const pushEnabled = () => Boolean(env.push.publicKey && env.push.privateKey);
