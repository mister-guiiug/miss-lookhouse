// ╔══════════════════════════════════════════════════════════════════════╗
// ║ Edge Function `ingest-run` — orchestrateur d'ingestion PLANIFIÉ (cron). ║
// ║ Déclenché toutes les heures par pg_cron → pg_net (cf. 0004_scheduling). ║
// ║ Gated par INGEST_TOKEN. Traite toutes les recherches « dues »           ║
// ║ (`lh_due_searches`). La logique de collecte est partagée (_shared/collect).║
// ║ En fin de passage, déclenche `embed` (embeddings des annonces, 0016).   ║
// ╚══════════════════════════════════════════════════════════════════════╝
import { cors, json } from '../_shared/cors.ts';
import { adminClient, checkCronToken } from '../_shared/admin.ts';
import { fetchWithTimeout } from '../_shared/net.ts';
import { runSearch, type CollectSearch } from '../_shared/collect.ts';

/**
 * LES EMBEDDINGS APRÈS LA COLLECTE, ET JAMAIS À SA PLACE.
 *
 * Appeler `embed` ici plutôt que depuis le cron : c'est l'heure même où une
 * annonce entre qu'elle gagne son vecteur, sans second cron ni second secret
 * dans le coffre — le jeton est déjà là. Un appel de serveur à serveur, comme
 * `notify-test` vers `notify`.
 *
 * RIEN NE PEUT FAIRE ÉCHOUER L'INGESTION : `embed` absent (pas encore
 * déployée → 404), lent ou en erreur, le passage est déjà écrit et son
 * résultat part tel quel ; l'issue d'`embed` n'est qu'une ligne de plus dans
 * la réponse. Le calcul étant rejouable et incrémental, ce qu'un passage n'a
 * pas fait, le suivant le fera.
 */
async function triggerEmbed(): Promise<Record<string, unknown>> {
  const url = Deno.env.get('SUPABASE_URL');
  const token = Deno.env.get('INGEST_TOKEN');
  if (!url || !token) return { status: 'skipped' };
  try {
    const res = await fetchWithTimeout(
      `${url}/functions/v1/embed`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: '{}',
      },
      // Un peu plus que le budget d'`embed` (25 s) : sa réponse arrive.
      30_000
    );
    const body = await res.json().catch(() => null);
    return { status: res.ok ? 'ok' : 'error', http: res.status, body };
  } catch (e) {
    return {
      status: 'error',
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (!checkCronToken(req)) return json({ error: 'Non autorisé.' }, 401);

  const supabase = adminClient();
  const { data: due, error } = await supabase
    .from('lh_due_searches')
    .select('id, user_id, name, frequency');
  if (error) return json({ error: error.message }, 500);

  const results: Array<Record<string, unknown>> = [];
  for (const search of (due ?? []) as CollectSearch[]) {
    try {
      results.push(await runSearch(supabase, search, 'schedule'));
    } catch (e) {
      results.push({
        search: search.name,
        status: 'error',
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  const embed = await triggerEmbed();
  return json({ processed: results.length, results, embed });
});
