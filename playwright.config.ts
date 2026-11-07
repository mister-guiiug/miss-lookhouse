import { defineConfig, devices } from '@playwright/test';
import { definePwaPlaywrightConfig } from '@mister-guiiug/dev-pwa-config/playwright-base';

/**
 * La fabrique du socle fournit la matrice de navigateurs, les reporters, le
 * gabarit de captures, `reducedMotion` et le serveur de test.
 *
 * `preview: true` : les e2e passent sur un BUILD de production, jamais sur le
 * serveur de développement. C'est le seul moyen d'exercer ce qui n'existe qu'à
 * la fin — service worker, minification, manifeste, CSP.
 *
 * `VITE_BASE_PATH=/` neutralise le chemin GitHub Pages le temps du test, et le
 * port 4173 évite la collision avec le serveur de développement (5214).
 *
 * `VITE_BACKEND=local`, ET C'EST LE POINT QUI COMPTE. `.env.production` est
 * versionné et pose `VITE_BACKEND=supabase` avec l'URL et la clé publique de
 * la base hébergée : un `vite build` nu produirait l'app de PRODUCTION, porte
 * de connexion comprise, branchée sur la vraie base. Une variable déjà
 * présente dans l'environnement l'emporte sur les fichiers `.env` de Vite :
 * le build de test retombe ainsi sur le mode local, celui où le moteur tourne
 * dans le navigateur sur le jeu de démonstration (`src/demo/seed.ts`, données
 * fictives). Aucune base, aucun réseau, aucun secret — en local comme en CI.
 *
 * `vite build` et non `npm run build` : le budget de poids et `tsc -b` ont
 * leur propre job, et ne doivent pas faire tomber le serveur de test.
 */
export default defineConfig(
  definePwaPlaywrightConfig({
    devices,
    testMatch: /.*\.spec\.ts$/,
    preview: true,
    port: 4173,
    command:
      'node scripts/with-env.mjs VITE_BACKEND=local VITE_BASE_PATH=/ -- vite build && node scripts/with-env.mjs VITE_BASE_PATH=/ -- vite preview --port 4173 --strictPort',
    // La langue du navigateur est FIXÉE : les prix et les dates passent par
    // `Intl`, qui suit la locale du contexte — `en-US` par défaut dans
    // Playwright. `overrides.use` est FUSIONNÉ par la fabrique (socle 6.x) :
    // le `baseURL` qu'elle calcule survit.
    overrides: { use: { locale: 'fr-FR' } },
  })
);
