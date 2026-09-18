import { defineConfig, type PluginOption } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { visualizer } from 'rollup-plugin-visualizer';
import { readFileSync } from 'node:fs';
import { pwaSeoPlugin } from '@mister-guiiug/dev-pwa-config/vite-pwa-base';
import { cspPlugin } from '@mister-guiiug/dev-pwa-config/vite-csp';
import { versionPlugin } from '@mister-guiiug/dev-pwa-config/vite-version';

const analyze = process.env.ANALYZE === '1';
const { version } = JSON.parse(readFileSync('./package.json', 'utf-8')) as {
  version: string;
};

// Dépôt GitHub Pages : https://mister-guiiug.github.io/miss-lookhouse/
export default defineConfig(({ command }) => {
  const buildId =
    process.env.DEPLOY_ID ||
    process.env.GITHUB_RUN_ID ||
    process.env.GITHUB_SHA?.slice(0, 7) ||
    (command === 'build' ? String(Date.now()) : 'dev');

  // `VITE_BASE_PATH` (déploiement famille + CI Lighthouse avec « / ») prioritaire.
  let basePath = '/';
  if (process.env.VITE_BASE_PATH) {
    basePath = process.env.VITE_BASE_PATH;
  } else if (command === 'build') {
    basePath = '/miss-lookhouse/';
  }

  return {
    base: basePath,
    define: {
      __APP_VERSION__: JSON.stringify(version),
      __APP_BUILD_ID__: JSON.stringify(buildId),
    },
    build: {
      sourcemap: true,
      chunkSizeWarningLimit: 900,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes('node_modules')) return;
            const norm = id.replace(/\\/g, '/');
            // Sentry est chargé par un `import()` que `loader` rend
            // analysable. Sans cette ligne il tomberait dans `vendor`, qui
            // est PRÉCHARGÉ : mesuré sur miss-uwh, 381,9 kB préchargés au
            // lieu de 227,2 — pour un total gzip identique à 0,1 kB près.
            if (norm.includes('/@sentry/')) return 'sentry';
            // ET POSTHOG POUR LA MÊME RAISON, EN PLUS GRAVE. Sentry préchargé
            // coûtait du poids ; PostHog préchargé casse une PROMESSE : l'ADR
            // 0012 dit que rien n'est chargé avant l'accord, et le socle ne
            // l'appelle qu'après. Sans cette ligne, la bibliothèque tombe
            // dans `vendor`, qui est PRÉCHARGÉ — elle serait donc
            // téléchargée chez un visiteur qui refuse. C'est `preloadGzipKb`
            // qui le voit, jamais le total.
            if (norm.includes('/posthog-js/')) return 'posthog';
            if (
              norm.includes('/vite-plugin-pwa/') ||
              norm.includes('/workbox-')
            )
              return 'pwa';
            if (norm.includes('/@supabase/')) return 'supabase';
            if (
              norm.includes('/react-dom/') ||
              norm.includes('/node_modules/react/') ||
              norm.includes('/scheduler/')
            )
              return 'react-vendor';
            if (norm.includes('/react-router/')) return 'router';
            if (norm.includes('/zustand/')) return 'zustand';
            if (norm.includes('/zod/')) return 'zod';
            if (norm.includes('/lucide-react/')) return 'icons';
            if (
              norm.includes('/tailwindcss/') ||
              norm.includes('/@tailwindcss/')
            )
              return 'tailwind';
            // Leaflet : hors chunks forcés → code-splitté avec la carte (lazy).
            if (norm.includes('/leaflet/')) return;
            return 'vendor';
          },
        },
      },
    },
    plugins: [
      // AVANT cspPlugin : il pose un script inline dans le <head>, que la
      // CSP doit hacher après coup ; et il écrit version.json au build.
      versionPlugin({ manifest: true, define: false }),
      react(),
      tailwindcss(),
      // Sitemap, robots, canonique, Open Graph — et deux <meta theme-color>
      // par schéma (relevé du 02/09/2026 : lookhouse n'avait rien de tout ça).
      pwaSeoPlugin({
        basePath,
        logoPath: '/icon-512.png',
        themeColor: { light: '#ecfeff', dark: '#08201e' },
      }),
      // CSP par hash (socle). connect-src : Supabase (REST + realtime) et le
      // géocodeur BAN ; img-src large : les photos des annonces et les tuiles
      // de carte viennent de partout.
      cspPlugin({
        dev: command === 'serve',
        // `analytics` ouvre les hôtes de PostHog — le nuage EUROPÉEN (ADR
        // 0012). Sans lui, l'ingestion que `ConsentBanner` déclenche APRÈS
        // l'accord serait refusée par la politique — et l'échec ne se verrait
        // qu'en console, sur le site déployé, une fois le consentement donné.
        analytics: true,
        connectSrc: [
          "'self'",
          'https://*.supabase.co',
          'wss://*.supabase.co',
          'https://api-adresse.data.gouv.fr',
        ],
        imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
      }),
      VitePWA({
        // `prompt`, pas `autoUpdate` : un déploiement ne recharge plus la page
        // en pleine saisie ; le bandeau du socle (AppUpdates, main.tsx) laisse
        // l'utilisateur choisir le moment.
        registerType: 'prompt',
        includeAssets: ['favicon.svg', 'robots.txt'],
        workbox: {
          globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2,webmanifest}'],
          /*
           * LE MORCEAU SENTRY HORS DU PRÉCACHE, sans quoi le découpage ne servirait
           * à rien : Workbox ramasse TOUT le JS émis, `import()` ou pas. Mesuré le
           * 16/09/2026 sur la production de deux apps du parc, 345 et 463 KiB de SDK
           * téléchargés par chaque visiteur, sans qu'aucun DSN soit posé.
           *
           * Hors précache, il part au premier `initSentry` réussi, et jamais si
           * l'observabilité reste éteinte : rapporter une erreur demande le réseau.
           */
          globIgnores: ['**/sentry-*.js'],
          // Handler Web Push (push/notificationclick) ajouté au SW généré.
          importScripts: ['push-sw.js'],
          // Le shell est mis en cache ; les appels API (Supabase) restent réseau.
          navigateFallbackDenylist: [/^\/auth/, /supabase\.co/],
        },
        manifest: {
          id: basePath,
          name: 'Miss LookHouse',
          short_name: 'Miss LookHouse',
          description:
            'Veille immobilière responsable : surveillez vos zones, historisez les annonces, repérez les doublons et baisses de prix.',
          theme_color: '#0f766e',
          background_color: '#ecfeff',
          display: 'standalone',
          orientation: 'portrait',
          scope: basePath,
          start_url: basePath,
          lang: 'fr',
          dir: 'ltr',
          categories: ['productivity', 'utilities', 'finance'],
          // Les deux captures de la fiche d'installation, prises par
          // `pwa-screenshots` du socle sur un build (06/09/2026) : sans elles,
          // Chrome propose une ligne et un bouton au lieu d'une fiche.
          screenshots: [
            {
              src: 'screenshots/narrow.png',
              sizes: '540x1170',
              type: 'image/png',
              form_factor: 'narrow',
              label: 'L’application, sur téléphone',
            },
            {
              src: 'screenshots/wide.png',
              sizes: '1280x720',
              type: 'image/png',
              form_factor: 'wide',
              label: 'L’application, sur ordinateur',
            },
          ],
          // Des PNG à côté du SVG : iOS et les lanceurs Android n'utilisent
          // pas le vectoriel pour l'icône d'accueil (relevé du 02/09/2026).
          icons: [
            {
              src: 'icon-192.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: 'icon-512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: 'icon-maskable-512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
            {
              src: 'favicon.svg',
              sizes: 'any',
              type: 'image/svg+xml',
              purpose: 'any',
            },
          ],
        },
      }),
      ...(analyze
        ? [
            visualizer({
              filename: 'dist/stats.html',
              gzipSize: true,
              brotliSize: true,
              open: !process.env.CI,
            }) as PluginOption,
          ]
        : []),
    ],
  };
});
