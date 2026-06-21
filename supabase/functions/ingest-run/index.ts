// ╔══════════════════════════════════════════════════════════════════════╗
// ║ Edge Function `ingest-run` — orchestrateur d'ingestion planifié.       ║
// ║ Déclenché toutes les heures par pg_cron → pg_net (cf. 0004_scheduling).║
// ║                                                                        ║
// ║ Sécurité : gated par INGEST_TOKEN ; utilise la clé service_role (hors  ║
// ║ RLS) UNIQUEMENT côté serveur. Renseigne explicitement `user_id`.       ║
// ║                                                                        ║
// ║ Collecte RESPONSABLE : pour une source SANS connecteur autorisé, la    ║
// ║ fonction NE scrape PAS — elle journalise et passe. Le vrai travail de  ║
// ║ collecte n'a lieu que via un connecteur `authorized_api` configuré.    ║
// ╚══════════════════════════════════════════════════════════════════════╝
import { cors, json } from '../_shared/cors.ts';
import { adminClient, checkCronToken } from '../_shared/admin.ts';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (!checkCronToken(req)) return json({ error: 'Non autorisé.' }, 401);

  const supabase = adminClient();

  // Recherches dues (vue SQL `lh_due_searches`).
  const { data: due, error } = await supabase
    .from('lh_due_searches')
    .select('id, user_id, name, frequency');
  if (error) return json({ error: error.message }, 500);

  const results: Array<{ search: string; status: string }> = [];

  for (const search of due ?? []) {
    // 1) Ouvre un run.
    const { data: run } = await supabase
      .from('ingestion_runs')
      .insert({
        user_id: search.user_id,
        search_id: search.id,
        trigger: 'schedule',
        status: 'running',
        started_at: new Date().toISOString(),
      })
      .select('id')
      .single();
    const runId = run?.id;

    // 2) Charge les connecteurs AUTORISÉS de l'utilisateur pour cette recherche.
    const { data: connectors } = await supabase
      .from('source_connectors')
      .select('id, source_id, mode, config, secret_ref')
      .eq('user_id', search.user_id)
      .eq('enabled', true)
      .eq('mode', 'authorized_api');

    if (!connectors || connectors.length === 0) {
      // Aucun connecteur autorisé : collecte responsable = no-op journalisé.
      if (runId) {
        await supabase.from('ingestion_events').insert({
          user_id: search.user_id,
          run_id: runId,
          level: 'info',
          step: 'collect',
          message:
            'Aucun connecteur autorisé configuré — pas de collecte automatique (import/capture manuel recommandé).',
        });
        await supabase
          .from('ingestion_runs')
          .update({
            status: 'success',
            finished_at: new Date().toISOString(),
            stats: { fetched: 0 },
          })
          .eq('id', runId);
      }
      await supabase
        .from('saved_searches')
        .update({ last_run_at: new Date().toISOString() })
        .eq('id', search.id);
      results.push({ search: search.name, status: 'no-connector' });
      continue;
    }

    // 3) TODO (V2) : pour chaque connecteur autorisé, appeler l'API officielle,
    //    normaliser, puis APPLIQUER le plan d'ingestion (insert/update/version/
    //    similarité/notifications). La logique pure vit dans src/ingestion +
    //    src/domain et doit être partagée (package commun) avec cette fonction.
    if (runId) {
      await supabase
        .from('ingestion_runs')
        .update({
          status: 'success',
          finished_at: new Date().toISOString(),
          stats: { fetched: 0, note: 'connecteurs autorisés à implémenter' },
        })
        .eq('id', runId);
    }
    await supabase
      .from('saved_searches')
      .update({ last_run_at: new Date().toISOString() })
      .eq('id', search.id);
    results.push({ search: search.name, status: 'authorized-connector-todo' });
  }

  return json({ processed: results.length, results });
});
