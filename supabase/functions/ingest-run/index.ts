// ╔══════════════════════════════════════════════════════════════════════╗
// ║ Edge Function `ingest-run` — orchestrateur d'ingestion planifié.       ║
// ║ Déclenché toutes les heures par pg_cron → pg_net (cf. 0004_scheduling).║
// ║                                                                        ║
// ║ Sécurité : gated par INGEST_TOKEN ; clé service_role (hors RLS) SERVEUR ║
// ║ uniquement. `user_id` est TOUJOURS renseigné explicitement.            ║
// ║                                                                        ║
// ║ Collecte RESPONSABLE : la fonction n'appelle QUE l'URL d'API qu'un      ║
// ║ connecteur `authorized_api` a explicitement configurée. Aucun scraping, ║
// ║ aucune source devinée. Sans connecteur, c'est un no-op journalisé.     ║
// ║                                                                        ║
// ║ B1 : la logique métier (normalisation + plan) est le CŒUR PARTAGÉ       ║
// ║ (_shared/core, généré depuis src/) — MÊME code que le front.           ║
// ╚══════════════════════════════════════════════════════════════════════╝
import { cors, json } from '../_shared/cors.ts';
import { adminClient, checkCronToken } from '../_shared/admin.ts';
import { parseListings } from '../_shared/core/ingestion/schema.ts';
import {
  planIngestion,
  type ExistingListing,
  type IngestionPlan,
  type PlannedUpsert,
} from '../_shared/core/ingestion/pipeline.ts';
import {
  applyFieldMap,
  pickItems,
} from '../_shared/core/ingestion/fieldMap.ts';
import type {
  CanonicalListing,
  SearchCriteria,
} from '../_shared/core/domain/types.ts';

type Supa = ReturnType<typeof adminClient>;
const nowIso = () => new Date().toISOString();
const num = (v: unknown): number | null =>
  v == null || v === '' ? null : Number(v);

interface DueSearch {
  id: string;
  user_id: string;
  name: string;
  frequency: string;
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
  for (const search of (due ?? []) as DueSearch[]) {
    try {
      results.push(await runSearch(supabase, search));
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

/** Traite une recherche due : collecte (connecteurs autorisés) → plan → application. */
async function runSearch(supabase: Supa, search: DueSearch) {
  const { data: run } = await supabase
    .from('ingestion_runs')
    .insert({
      user_id: search.user_id,
      search_id: search.id,
      trigger: 'schedule',
      status: 'running',
      started_at: nowIso(),
    })
    .select('id')
    .single();
  const runId: string | undefined = run?.id;

  const log = (level: string, step: string, message: string) =>
    runId
      ? supabase.from('ingestion_events').insert({
          user_id: search.user_id,
          run_id: runId,
          level,
          step,
          message,
        })
      : Promise.resolve();

  const finish = async (status: string, stats: Record<string, unknown>) => {
    if (runId)
      await supabase
        .from('ingestion_runs')
        .update({ status, finished_at: nowIso(), stats })
        .eq('id', runId);
    await supabase
      .from('saved_searches')
      .update({ last_run_at: nowIso() })
      .eq('id', search.id);
  };

  // Critères complets de la recherche (la vue `lh_due_searches` est minimale).
  const { data: full } = await supabase
    .from('saved_searches')
    .select('*')
    .eq('id', search.id)
    .single();
  if (!full) {
    await finish('error', { fetched: 0 });
    return { search: search.name, status: 'search-missing' };
  }

  // Connecteurs AUTORISÉS de l'utilisateur, restreints aux sources de la recherche.
  let q = supabase
    .from('source_connectors')
    .select('id, source_id, config, secret_ref')
    .eq('user_id', search.user_id)
    .eq('enabled', true)
    .eq('mode', 'authorized_api');
  const sourceIds: string[] = full.source_ids ?? [];
  if (sourceIds.length > 0) q = q.in('source_id', sourceIds);
  const { data: connectors } = await q;

  if (!connectors || connectors.length === 0) {
    await log(
      'info',
      'collect',
      'Aucun connecteur autorisé configuré — pas de collecte automatique (import/capture manuel recommandé).'
    );
    await finish('success', { fetched: 0 });
    return { search: search.name, status: 'no-connector' };
  }

  // 1) COLLECTE responsable : uniquement les URLs configurées par l'utilisateur.
  const incoming: CanonicalListing[] = [];
  let warnings = 0;
  for (const connector of connectors) {
    try {
      const { listings, errors } = await fetchConnector(connector);
      incoming.push(...listings);
      for (const err of errors) {
        warnings++;
        await log('warn', 'normalize', err);
      }
      await log(
        'info',
        'collect',
        `Connecteur ${connector.source_id} : ${listings.length} annonce(s) récupérée(s).`
      );
    } catch (e) {
      warnings++;
      await log(
        'warn',
        'collect',
        `Connecteur ${connector.source_id} ignoré : ${e instanceof Error ? e.message : String(e)}`
      );
    }
  }

  if (incoming.length === 0) {
    await finish(warnings > 0 ? 'partial' : 'success', {
      fetched: 0,
      warnings,
    });
    return { search: search.name, status: 'no-data', warnings };
  }

  // 2) PLAN (cœur partagé, pur) à partir de l'existant en base.
  const existing = await loadExisting(supabase, search.user_id, incoming);
  const plan = planIngestion(incoming, existing, {
    criteria: toCriteria(full),
  });

  // 3) APPLICATION du plan (insert/update + versions + similarité + notifs).
  const applied = await applyPlan(supabase, search.user_id, search.id, plan);

  const stats = {
    fetched: incoming.length,
    new: applied.added,
    updated: applied.updated,
    similarities: applied.similarities,
    notifications: applied.notifications,
    warnings,
  };
  await finish(warnings > 0 ? 'partial' : 'success', stats);
  return { search: search.name, status: 'ok', stats };
}

/** Récupère + normalise les annonces d'un connecteur autorisé (collecte responsable). */
async function fetchConnector(connector: {
  source_id: string;
  config: Record<string, unknown> | null;
  secret_ref: string | null;
}): Promise<{ listings: CanonicalListing[]; errors: string[] }> {
  const cfg = (connector.config ?? {}) as Record<string, unknown>;
  const url = typeof cfg.url === 'string' ? cfg.url : '';
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('config.url manquante ou invalide');
  }
  if (parsed.protocol !== 'https:')
    throw new Error('config.url doit être https');

  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...((cfg.headers as Record<string, string>) ?? {}),
  };
  // Secret éventuel (jeton d'API) : lu côté serveur, jamais stocké en base.
  if (connector.secret_ref) {
    const secret = Deno.env.get(connector.secret_ref);
    if (secret) {
      const h = (cfg.authHeader as string) ?? 'Authorization';
      const scheme = (cfg.authScheme as string) ?? 'Bearer';
      headers[h] = scheme ? `${scheme} ${secret}` : secret;
    }
  }

  const res = await fetch(url, {
    method: (cfg.method as string) ?? 'GET',
    headers,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const payload = await res.json();

  const items = pickItems(payload, cfg.listPath as string | undefined);
  const map = (cfg.map as Record<string, string> | undefined) ?? undefined;
  const raws = items.map(it => ({
    ...applyFieldMap(it, map),
    sourceId: connector.source_id,
  }));
  return parseListings(raws);
}

/** Charge l'existant en base pour les sources entrantes → forme `ExistingListing`. */
async function loadExisting(
  supabase: Supa,
  userId: string,
  incoming: CanonicalListing[]
): Promise<ExistingListing[]> {
  const sources = [...new Set(incoming.map(l => l.sourceId))];
  if (sources.length === 0) return [];
  const { data } = await supabase
    .from('listings')
    .select(
      'id, source_id, external_id, fingerprint, source_status, disappeared_at, title, description, price, surface_m2, rooms, bedrooms, property_type, lat, lng, postal_code, is_pro, contact_name'
    )
    .eq('user_id', userId)
    .in('source_id', sources);
  return ((data ?? []) as Record<string, unknown>[]).map(r => ({
    id: r.id as string,
    sourceId: r.source_id as string,
    externalId: r.external_id as string,
    fingerprint: (r.fingerprint as string) ?? null,
    sourceStatus: (r.source_status as string) ?? null,
    disappeared: r.disappeared_at != null,
    title: (r.title as string) ?? null,
    description: (r.description as string) ?? null,
    price: num(r.price),
    surfaceM2: num(r.surface_m2),
    rooms: (r.rooms as number) ?? null,
    bedrooms: (r.bedrooms as number) ?? null,
    propertyType: (r.property_type as string) ?? null,
    lat: num(r.lat),
    lng: num(r.lng),
    postalCode: (r.postal_code as string) ?? null,
    isPro: (r.is_pro as boolean) ?? null,
    contactName: (r.contact_name as string) ?? null,
  }));
}

/** saved_searches (colonnes BD) → SearchCriteria (cœur). */
function toCriteria(s: Record<string, unknown>): SearchCriteria {
  return {
    priceMin: num(s.price_min),
    priceMax: num(s.price_max),
    surfaceMin: num(s.surface_min),
    surfaceMax: num(s.surface_max),
    roomsMin: (s.rooms_min as number) ?? null,
    roomsMax: (s.rooms_max as number) ?? null,
    propertyTypes: (s.property_types as string[]) ?? [],
    keywordsRequired: (s.keywords_required as string[]) ?? [],
    keywordsExcluded: (s.keywords_excluded as string[]) ?? [],
    centerLat: num(s.center_lat),
    centerLng: num(s.center_lng),
    radiusKm: num(s.radius_km),
  };
}

/** Applique le plan d'ingestion en base. Renvoie les compteurs. */
async function applyPlan(
  supabase: Supa,
  userId: string,
  searchId: string,
  plan: IngestionPlan
) {
  const idByKey = new Map<string, string>();
  let added = 0;
  let updated = 0;

  for (const up of plan.upserts) {
    if (up.kind === 'insert') {
      const { data, error } = await supabase
        .from('listings')
        .insert(listingRow(userId, searchId, up))
        .select('id')
        .single();
      if (error) throw new Error(`insert listing: ${error.message}`);
      const id = data!.id as string;
      idByKey.set(up.key, id);
      added++;
      await insertVersion(supabase, userId, id, up);
    } else if (up.matchedId) {
      idByKey.set(up.key, up.matchedId);
      const { error } = await supabase
        .from('listings')
        .update(listingUpdate(up))
        .eq('id', up.matchedId);
      if (error) throw new Error(`update listing: ${error.message}`);
      updated++;
      await insertVersion(supabase, userId, up.matchedId, up);
    }
  }

  let similarities = 0;
  for (const s of plan.similarities) {
    const subjectId = idByKey.get(s.subjectKey);
    if (!subjectId || subjectId === s.withId) continue;
    // Convention : listing_a < listing_b (contrainte d'unicité de paire).
    const [a, b] =
      subjectId < s.withId ? [subjectId, s.withId] : [s.withId, subjectId];
    const { error } = await supabase.from('listing_similarity').upsert(
      {
        user_id: userId,
        listing_a: a,
        listing_b: b,
        score: s.score,
        bucket: s.bucket,
        breakdown: s.breakdown,
      },
      { onConflict: 'listing_a,listing_b' }
    );
    if (!error) similarities++;
  }

  let notifications = 0;
  for (const n of plan.notifications) {
    const listingId = idByKey.get(n.subjectKey) ?? null;
    const { error } = await supabase.from('notifications').insert({
      user_id: userId,
      type: n.type,
      title: n.title,
      body: n.body,
      listing_id: listingId,
      search_id: searchId,
      payload: n.payload,
    });
    if (!error) notifications++;
  }

  return { added, updated, similarities, notifications };
}

function listingRow(userId: string, searchId: string, up: PlannedUpsert) {
  const c = up.canonical;
  return {
    user_id: userId,
    source_id: c.sourceId,
    external_id: c.externalId,
    search_id: searchId,
    fingerprint: up.fingerprint,
    relevance_score: Math.round(up.relevance),
    source_status: 'active',
    currency: c.currency ?? 'EUR',
    first_seen_at: nowIso(),
    last_seen_at: nowIso(),
    last_changed_at: nowIso(),
    raw: c,
    ...listingFields(c),
  };
}

function listingUpdate(up: PlannedUpsert) {
  const c = up.canonical;
  return {
    fingerprint: up.fingerprint,
    relevance_score: Math.round(up.relevance),
    source_status: 'active',
    last_seen_at: nowIso(),
    last_changed_at: nowIso(),
    raw: c,
    ...listingFields(c),
  };
}

/** Champs canoniques communs (insert + update) → colonnes BD. */
function listingFields(c: CanonicalListing) {
  return {
    url: c.url ?? null,
    title: c.title ?? null,
    description: c.description ?? null,
    price: c.price ?? null,
    surface_m2: c.surfaceM2 ?? null,
    rooms: c.rooms ?? null,
    bedrooms: c.bedrooms ?? null,
    property_type: c.propertyType ?? null,
    floor: c.floor ?? null,
    dpe: c.dpe ?? null,
    charges: c.charges ?? null,
    agency_fees: c.agencyFees ?? null,
    lat: c.lat ?? null,
    lng: c.lng ?? null,
    postal_code: c.postalCode ?? null,
    city: c.city ?? null,
    address_approx: c.addressApprox ?? null,
    is_pro: c.isPro ?? null,
    contact_name: c.contactName ?? null,
    published_at: c.publishedAt ?? null,
    source_updated_at: c.sourceUpdatedAt ?? null,
  };
}

async function insertVersion(
  supabase: Supa,
  userId: string,
  listingId: string,
  up: PlannedUpsert
) {
  const c = up.canonical;
  // Le trigger `lh_record_price_point` alimente listing_price_history si le prix change.
  await supabase.from('listing_versions').insert({
    user_id: userId,
    listing_id: listingId,
    captured_at: nowIso(),
    price: c.price ?? null,
    surface_m2: c.surfaceM2 ?? null,
    rooms: c.rooms ?? null,
    bedrooms: c.bedrooms ?? null,
    title: c.title ?? null,
    description: c.description ?? null,
    source_status: 'active',
    media_count: c.mediaUrls?.length ?? 0,
    content_hash: up.fingerprint,
    raw: c,
  });
}
