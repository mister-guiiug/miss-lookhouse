// ╔══════════════════════════════════════════════════════════════════════╗
// ║ Edge Function `connectors-admin` — gestion COLLABORATIVE des connecteurs ║
// ║ du catalogue PARTAGÉ. Appelée par un utilisateur authentifié (verify_jwt) ║
// ║ depuis l'écran Traitements : lister / activer-désactiver / définir le     ║
// ║ périmètre (départements) des connecteurs des recherches `is_public`.      ║
// ║ Écrit via service_role (pas d'ouverture RLS en écriture). Ne touche QUE   ║
// ║ les connecteurs rattachés à une recherche publique.                       ║
// ╚══════════════════════════════════════════════════════════════════════╝
import { cors, json } from '../_shared/cors.ts';
import { adminClient } from '../_shared/admin.ts';

type Supa = ReturnType<typeof adminClient>;

/** (owner, source_ids) des recherches publiques → ensemble des connecteurs « partagés ». */
async function sharedConnectorIds(supabase: Supa): Promise<Set<string>> {
  const { data: searches } = await supabase
    .from('saved_searches')
    .select('user_id, source_ids')
    .eq('is_public', true);
  const owners = [...new Set((searches ?? []).map(s => s.user_id as string))];
  const sources = new Set(
    (searches ?? []).flatMap(s => (s.source_ids as string[] | null) ?? [])
  );
  if (owners.length === 0) return new Set();
  const { data: cons } = await supabase
    .from('source_connectors')
    .select('id, source_id')
    .in('user_id', owners);
  const ids = new Set<string>();
  for (const c of cons ?? []) {
    if (sources.size === 0 || sources.has(c.source_id as string)) {
      ids.add(c.id as string);
    }
  }
  return ids;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const supabase = adminClient();
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const action = body.action;

  if (action === 'list') {
    const { data: searches } = await supabase
      .from('saved_searches')
      .select('user_id, source_ids')
      .eq('is_public', true);
    const owners = [...new Set((searches ?? []).map(s => s.user_id as string))];
    const sources = new Set(
      (searches ?? []).flatMap(s => (s.source_ids as string[] | null) ?? [])
    );
    if (owners.length === 0) return json({ connectors: [] });
    const { data: cons, error } = await supabase
      .from('source_connectors')
      .select('id, source_id, label, enabled, config')
      .in('user_id', owners);
    if (error) return json({ error: error.message }, 500);
    const connectors = (cons ?? [])
      .filter(c => sources.size === 0 || sources.has(c.source_id as string))
      .map(c => {
        const cfg = (c.config ?? {}) as Record<string, unknown>;
        return {
          id: c.id as string,
          sourceId: c.source_id as string,
          label: c.label as string,
          enabled: c.enabled as boolean,
          kind: (cfg.kind as string) ?? 'json_api',
          departments: (cfg.departments as string[]) ?? [],
        };
      });
    return json({ connectors });
  }

  if (action === 'update') {
    const id = String(body.id ?? '');
    const allowed = await sharedConnectorIds(supabase);
    if (!id || !allowed.has(id)) {
      return json({ error: 'Connecteur non partagé ou introuvable.' }, 403);
    }
    const { data: cur } = await supabase
      .from('source_connectors')
      .select('config')
      .eq('id', id)
      .single();
    const config = { ...((cur?.config ?? {}) as Record<string, unknown>) };
    if (Array.isArray(body.departments)) {
      config.departments = (body.departments as unknown[])
        .map(d => String(d).trim())
        .filter(Boolean);
    }
    const patch: Record<string, unknown> = {
      config,
      updated_at: new Date().toISOString(),
    };
    if (typeof body.enabled === 'boolean') patch.enabled = body.enabled;
    const { error } = await supabase
      .from('source_connectors')
      .update(patch)
      .eq('id', id);
    if (error) return json({ error: error.message }, 500);
    return json({ ok: true });
  }

  return json({ error: 'Action inconnue.' }, 400);
});
