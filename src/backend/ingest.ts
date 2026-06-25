/**
 * Déclenchement IN-APP de la collecte du catalogue partagé. Appelle l'Edge
 * Function `ingest-now` (verify_jwt) avec le JWT de l'utilisateur — le serveur
 * (service_role) rafraîchit les recherches publiques sous leur compte
 * propriétaire (système). Le client ne possède aucun secret.
 */
import { getSupabase } from './supabaseClient';

export interface IngestNowResult {
  processed: number;
  results: Array<{ search: string; status: string; stats?: unknown }>;
}

export async function triggerIngestNow(): Promise<IngestNowResult> {
  const s = getSupabase();
  if (!s) throw new Error('Collecte indisponible (mode local).');
  const { data, error } = await s.functions.invoke<IngestNowResult>(
    'ingest-now',
    { body: {} }
  );
  if (error) throw new Error(error.message);
  return data ?? { processed: 0, results: [] };
}
