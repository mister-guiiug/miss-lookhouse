// ╔══════════════════════════════════════════════════════════════════════╗
// ║ Edge Function `ingest-now` — déclenchement IN-APP de la collecte.       ║
// ║                                                                        ║
// ║ Appelée par un UTILISATEUR authentifié (verify_jwt ON) via un bouton    ║
// ║ « Actualiser le catalogue ». Rafraîchit le catalogue PARTAGÉ            ║
// ║ (`saved_searches.is_public = true`), écrit sous le compte propriétaire  ║
// ║ (système) — donc visible par tous (RLS lecture publique). Anti-abus :   ║
// ║ ignore une recherche collectée il y a moins de MIN_GAP_MIN minutes.     ║
// ║ Logique de collecte partagée avec le cron (_shared/collect).            ║
// ╚══════════════════════════════════════════════════════════════════════╝
import { cors, json } from '../_shared/cors.ts';
import { adminClient } from '../_shared/admin.ts';
import { runSearch, type CollectSearch } from '../_shared/collect.ts';

const MIN_GAP_MIN = 10;

interface PublicSearch extends CollectSearch {
  last_run_at: string | null;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  // verify_jwt ON → Supabase a déjà validé le JWT de l'utilisateur. On écrit
  // sous le compte propriétaire de chaque recherche publique (service_role).
  const supabase = adminClient();
  const { data: pub, error } = await supabase
    .from('saved_searches')
    .select('id, user_id, name, frequency, last_run_at')
    .eq('is_public', true)
    .eq('active', true);
  if (error) return json({ error: error.message }, 500);

  const now = Date.now();
  const results: Array<Record<string, unknown>> = [];
  for (const s of (pub ?? []) as PublicSearch[]) {
    if (
      s.last_run_at &&
      now - new Date(s.last_run_at).getTime() < MIN_GAP_MIN * 60_000
    ) {
      results.push({ search: s.name, status: 'too-recent' });
      continue;
    }
    try {
      results.push(await runSearch(supabase, s, 'manual'));
    } catch (e) {
      results.push({
        search: s.name,
        status: 'error',
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }
  return json({ processed: results.length, results });
});
