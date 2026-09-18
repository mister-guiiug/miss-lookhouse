/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  readonly VITE_BACKEND?: 'local' | 'supabase';
  /** DSN Sentry (optionnel) : vide = observabilité muette, sans bruit. */
  readonly VITE_SENTRY_DSN?: string;
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  readonly VITE_VAPID_PUBLIC_KEY?: string;
  readonly VITE_GEOCODER_URL?: string;
  readonly VITE_BASE_PATH?: string;
  /**
   * Clé de projet PostHog (`phc_…`), nuage EUROPÉEN — ADR 0012. LA MÊME pour
   * tout le parc : un seul projet, les applications distinguées dedans par la
   * super-propriété `app_name` que le socle déduit du chemin de base. Publique
   * par conception (elle part dans le bundle), donc `vars` et jamais
   * `secrets`. Absente, le bandeau de consentement ne rend rien et rien n'est
   * mesuré : c'est le seul interrupteur.
   */
  readonly VITE_POSTHOG_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare const __APP_VERSION__: string;
declare const __APP_BUILD_ID__: string;
