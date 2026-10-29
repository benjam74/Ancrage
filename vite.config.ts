import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  // Served under /Ancrage/ on GitHub Pages; at the root everywhere else.
  base: process.env.VITE_BASE ?? '/',
  plugins: [
    svelte(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['icons/apple-touch-icon.png', 'icons/icon.svg'],
      manifest: {
        name: 'Ancrage',
        short_name: 'Ancrage',
        description: 'Répétition espacée pour le coaching et la PNL : tes cartes, planifiées par FSRS.',
        lang: 'fr',
        start_url: '.#accueil',
        scope: '.',
        display: 'standalone',
        background_color: '#eef4f3',
        theme_color: '#13505e',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,mjs,css,html,woff2,png,svg,webmanifest}'],
        navigateFallback: 'index.html',
      },
    }),
  ],
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // A fixed zone with a DST change, so day arithmetic is tested the same way everywhere.
    env: { TZ: 'Europe/Paris' },
  },
});
