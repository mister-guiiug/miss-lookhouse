/**
 * Client Supabase paresseux (créé seulement en mode `supabase`). La clé `anon`
 * est PUBLIQUE et inoffensive : toute la sécurité est dans la RLS côté serveur.
 * Aucun secret (`service_role`, PAT) ne doit jamais transiter par le client.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { IS_SUPABASE } from './config';

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient | null {
  if (!IS_SUPABASE) return null;
  if (client) return client;
  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  client = createClient(url, key, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });
  return client;
}
