// Client Cloudinary (photos des plats, des catégories et de l'accueil).
// Les clés restent côté serveur : le navigateur n'envoie jamais directement à Cloudinary.
import { v2 as cloudinary } from 'cloudinary';
import { env, cloudinaryEnabled } from '../config/env.js';

if (cloudinaryEnabled()) {
  cloudinary.config({
    cloud_name: env.cloudinary.cloudName,
    api_key: env.cloudinary.apiKey,
    api_secret: env.cloudinary.apiSecret,
    secure: true,
  });
}

export { cloudinary, cloudinaryEnabled };
