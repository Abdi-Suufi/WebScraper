import { resolve } from 'node:path';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const developmentCsp =
  "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' http://localhost:5173 ws://localhost:5173; object-src 'none'; base-uri 'none'; form-action 'none'; frame-src 'none'";

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    define: {
      'process.env.ENABLE_LINKEDIN': JSON.stringify(process.env.ENABLE_LINKEDIN ?? 'false'),
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
  },
  renderer: {
    resolve: {
      alias: {
        '@': resolve('src/renderer/src'),
        '@shared': resolve('src/shared'),
      },
    },
    plugins: [
      react(),
      tailwindcss(),
      {
        name: 'job-search-development-csp',
        apply: 'serve',
        transformIndexHtml: {
          order: 'pre',
          handler(html) {
            return html.replace(
              /(<meta\s+http-equiv="Content-Security-Policy"\s+content=")[^"]*(")/,
              `$1${developmentCsp}$2`,
            );
          },
        },
      },
    ],
  },
});
