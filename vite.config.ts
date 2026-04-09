import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const rootDir = path.resolve(__dirname);
  const env = loadEnv(mode, rootDir, 'VITE_');

  return {
    plugins: [react()],
    envDir: rootDir,
    envPrefix: 'VITE_',
    optimizeDeps: {
      exclude: ['lucide-react'],
    },
    // SPA fallback: serve index.html for all routes (e.g. /applicant/login, /admin/login)
    server: {
      historyApiFallback: true,
    },
    preview: {
      historyApiFallback: true,
    },
  };
});
