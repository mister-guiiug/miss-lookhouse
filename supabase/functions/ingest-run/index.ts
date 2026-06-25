// ╔══════════════════════════════════════════════════════════════════════╗
// ║ Edge Function `ingest-run` — orchestrateur d'ingestion PLANIFIÉ (cron). ║
// ║ Déclenché toutes les heures par pg_cron → pg_net (cf. 0004_scheduling). ║
// ║ Gated par INGEST_TOKEN. Traite toutes les recherches « dues »           ║
// ║ (`lh_due_searches`). La logique de collecte est partagée (_shared/collect).║
// ╚══════════════════════════════════════════════════════════════════════╝
import { cors, json } from '../_shared/cors.ts';
import { adminClient, checkCronToken } from '../_shared/admin.ts';
import { runSearch, type CollectSearch } from '../_shared/collect.ts';

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
  return json({ processed: results.length, results });
});
