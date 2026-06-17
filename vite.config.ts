import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const API_TARGET = process.env.VITE_DEV_API_URL ?? 'http://127.0.0.1:3000';
const workspaceRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);

export default defineConfig({
  // Lê VITE_* do .env na raiz do monorepo (npm run dev na raiz)
  envDir: workspaceRoot,
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/v1': {
        target: API_TARGET,
        changeOrigin: true,
      },
      '/health': {
        target: API_TARGET,
        changeOrigin: true,
      },
    },
  },
});
