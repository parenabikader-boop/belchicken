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
};

export const whatsappEnabled = () =>
  Boolean(env.whatsapp.token && env.whatsapp.phoneNumberId && env.whatsapp.teamNumbers.length);

export const cloudinaryEnabled = () =>
  Boolean(env.cloudinary.cloudName && env.cloudinary.apiKey && env.cloudinary.apiSecret);

export const pushEnabled = () => Boolean(env.push.publicKey && env.push.privateKey);
