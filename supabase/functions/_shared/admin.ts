// Client Supabase à privilèges SERVEUR (service_role) pour les jobs planifiés.
// ⚠️ La clé service_role contourne la RLS : elle ne doit JAMAIS être exposée au
// client. Disponible uniquement comme secret d'Edge Function.
import {
  createClient,
  type SupabaseClient,
} from 'https://esm.sh/@supabase/supabase-js@2';
import { timingSafeEqual } from './net.ts';

export function adminClient(): SupabaseClient {
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key)
    throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY manquants.');
  return createClient(url, key, { auth: { persistSession: false } });
}

/**
 * Vérifie le jeton d'appel (en-tête Authorization: Bearer <token>) contre le
 * secret `INGEST_TOKEN`. Empêche tout déclenchement non autorisé de la fonction.
 */
export function checkCronToken(req: Request): boolean {
  const expected = Deno.env.get('INGEST_TOKEN');
  if (!expected) return false;
  const got = (req.headers.get('Authorization') ?? '').replace(
    /^Bearer\s+/i,
    ''
  );
  return timingSafeEqual(got, expected);
}
