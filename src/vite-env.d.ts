/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  readonly VITE_BACKEND?: 'local' | 'supabase';
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  readonly VITE_VAPID_PUBLIC_KEY?: string;
  readonly VITE_GEOCODER_URL?: string;
  readonly VITE_BASE_PATH?: string;
  /**
   * Identifiant de mesure GA4 (`G-…`), propre à CETTE application. Absent, le
   * bandeau de consentement ne rend rien et rien n'est mesuré : c'est le seul
   * interrupteur.
   */
  readonly VITE_GA_MEASUREMENT_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare const __APP_VERSION__: string;
declare const __APP_BUILD_ID__: string;
