import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  // Leaflet ships as CommonJS; Vite must pre-bundle it into an ESM module
  // so `import L from 'leaflet'` resolves a default export. Never exclude it.
  optimizeDeps: {
    include: ['leaflet'],
  },
  server: {
    host: true,
  },
});
