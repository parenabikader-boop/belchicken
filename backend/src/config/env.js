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
};

export const whatsappEnabled = () =>
  Boolean(env.whatsapp.token && env.whatsapp.phoneNumberId && env.whatsapp.teamNumbers.length);
