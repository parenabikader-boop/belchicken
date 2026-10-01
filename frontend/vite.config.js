import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Espace équipe : /api/staff passe par le site, comme en ligne avec Vercel (voir src/api/client.js)
    proxy: { '/api/staff': 'http://localhost:3006' },
  },
});
