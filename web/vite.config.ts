import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// API a la que reenvía el proxy en desarrollo. Las peticiones a /api/* llegan a la API
// sin el prefijo, así las rutas del SPA (/dashboard, /login) nunca chocan con las de Express.
const API_TARGET = 'http://localhost:3000';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: API_TARGET,
        // Host de la API, no el de Vite: Express construye shortUrl con él.
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['src/test/setup.ts'],
  },
});
