import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

const BUILD_ID = new Date().toISOString();

export default defineConfig({
  define: { __BUILD_ID__: JSON.stringify(BUILD_ID) },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // Custom service worker (src/sw.ts) so the app can ask it to verify
      // and repair the offline cache ("Save Trip Offline").
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      // 'prompt': a new version installs in the background and only takes over
      // when the user taps "Atualizar" — the old offline copy stays intact.
      registerType: 'prompt',
      injectRegister: false,
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,svg,png,jpg,jpeg,webp,avif,woff2,json,webmanifest,txt}'],
        // Fonts ship cyrillic/greek subsets we never render.
        globIgnores: ['**/*cyrillic*', '**/*greek*', '**/*-full-*', '**/*-opsz-*', '**/*-soft-*', '**/*-wonk-*', '**/*-standard-*'],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
      },
      manifest: {
        id: '/',
        name: 'Our Vietnam Trip',
        short_name: 'Vietnam Trip',
        description: 'Nosso guia de viagem pelo Vietnã — roteiro, mapa e reservas, também offline.',
        lang: 'pt-BR',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#F5EFE4',
        theme_color: '#F5EFE4',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      devOptions: { enabled: false, type: 'module' },
    }),
  ],
});
