/**
 * Client Supabase via la fabrique du socle (`dev-pwa-config/supabase-client`) :
 * rien ne s'exécute à l'import, le SDK n'est chargé (import dynamique) qu'au
 * premier `getClient()`. La clé `anon` est PUBLIQUE et inoffensive : toute la
 * sécurité est dans la RLS côté serveur. Aucun secret (`service_role`, PAT) ne
 * doit jamais transiter par le client.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { createSupabaseClientFactory } from '@mister-guiiug/dev-pwa-config/supabase-client';
import { IS_SUPABASE } from './config';

/** La fabrique socle : `isConfigured()`, `missing()`, `getClient()`, `reset()`. */
export const supabase = createSupabaseClientFactory<SupabaseClient>({
  env: import.meta.env,
  // `flowType: 'pkce'` N'EST PAS UN RÉGLAGE DE SÉCURITÉ ICI, C'EST UNE
  // NÉCESSITÉ DE ROUTAGE. La connexion par lien renvoie, en flux implicite,
  // le jeton dans le FRAGMENT (`#access_token=…`) — l'endroit exact où le
  // `HashRouter` de cette app lit la route : il y verrait une adresse
  // inconnue, la remplacerait par « / », et le jeton disparaîtrait avant
  // d'avoir servi. PKCE renvoie `?code=…` dans la query, que le routeur ne
  // touche pas ; `detectSessionInUrl` l'échange contre une session.
  auth: { detectSessionInUrl: true, flowType: 'pkce' },
});

/**
 * Le client en mode `supabase`, `null` en mode `local` — l'équivalent
 * ASYNCHRONE de l'ancienne fabrique locale. `getClient()` du socle rejette
 * quand la configuration manque ; ici, `IS_SUPABASE` (assis sur le même
 * jugement que `isConfigured()`) garantit qu'on ne l'appelle que configuré.
 */
export async function getSupabase(): Promise<SupabaseClient | null> {
  if (!IS_SUPABASE) return null;
  return supabase.getClient();
}
