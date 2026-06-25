// ╔══════════════════════════════════════════════════════════════════════╗
// ║ Cœur de COLLECTE serveur, partagé par `ingest-run` (cron) et            ║
// ║ `ingest-now` (déclenchement in-app par un utilisateur authentifié).     ║
// ║                                                                        ║
// ║ `runSearch` traite UNE recherche : collecte (connecteurs autorisés de   ║
// ║ son propriétaire) → plan (cœur pur partagé) → application en base.      ║
// ║ Clé service_role (hors RLS) SERVEUR uniquement ; `user_id` = celui de   ║
// ║ la recherche (le propriétaire — compte système pour le catalogue).      ║
// ╚══════════════════════════════════════════════════════════════════════╝
import { adminClient } from './admin.ts';
import { assertPublicHttpsUrl, fetchWithTimeout } from './net.ts';
import { parseListings } from './core/ingestion/schema.ts';
import {
  planIngestion,
  type ExistingListing,
  type IngestionPlan,
  type PlannedUpsert,
} from './core/ingestion/pipeline.ts';
import { applyFieldMap, pickItems } from './core/ingestion/fieldMap.ts';
import type { CanonicalListing, SearchCriteria } from './core/domain/types.ts';
import { collectSite } from './core/ingestion/sites/registry.ts';
import type { SiteFetch } from './core/ingestion/sites/types.ts';

export type Supa = ReturnType<typeof adminClient>;
const nowIso = () => new Date().toISOString();
const num = (v: unknown): number | null =>
  v == null || v === '' ? null : Number(v);

/** Recherche à collecter (sous-ensemble minimal ; `runSearch` recharge le reste). */
export interface CollectSearch {
  id: string;
  user_id: string;
  name: string;
  frequency: string;
}

/** Origine du run (colonne `ingestion_runs.trigger`, enum run_trigger). */
export type RunTrigger = 'schedule' | 'manual' | 'replay';

/** Traite une recherche : collecte (connecteurs autorisés) → plan → application. */
export async function runSearch(
  supabase: Supa,
  search: CollectSearch,
  trigger: RunTrigger = 'schedule'
) {
  const { data: run } = await supabase
    .from('ingestion_runs')
    .insert({
      user_id: search.user_id,
      search_id: search.id,
      trigger,
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

  const { data: full } = await supabase
    .from('saved_searches')
    .select('*')
    .eq('id', search.id)
    .single();
  if (!full) {
    await finish('error', { fetched: 0 });
    return { search: search.name, status: 'search-missing' };
  }

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
      'Aucun connecteur autorisé configuré — pas de collecte automatique.'
    );
    await finish('success', { fetched: 0 });
    return { search: search.name, status: 'no-connector' };
  }

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

  const existing = await loadExisting(supabase, search.user_id, incoming);
  const plan = planIngestion(incoming, existing, {
    criteria: toCriteria(full),
  });
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

const COLLECTOR_UA =
  'miss-lookhouse-collector/1.0 (+https://github.com/mister-guiiug/miss-lookhouse; collecte responsable)';

// Débit conservateur : ~300 ms entre deux requêtes sortantes (collecte responsable).
const MIN_FETCH_GAP_MS = 300;
let lastFetchAt = 0;
async function throttle(): Promise<void> {
  const wait = lastFetchAt + MIN_FETCH_GAP_MS - Date.now();
  if (wait > 0) await new Promise(r => setTimeout(r, wait));
  lastFetchAt = Date.now();
}

/** Fetch injecté aux connecteurs de site : anti-SSRF + timeout + débit poli. */
function siteFetch(): SiteFetch {
  return {
    async text(u: string): Promise<string> {
      await assertPublicHttpsUrl(u);
      await throttle();
      const r = await fetchWithTimeout(
        u,
        { headers: { 'user-agent': COLLECTOR_UA } },
        10000
      );
      if (!r.ok) throw new Error(`HTTP ${r.status} (${u})`);
      return await r.text();
    },
    async json<T>(u: string): Promise<T> {
      await assertPublicHttpsUrl(u);
      await throttle();
      const r = await fetchWithTimeout(
        u,
        { headers: { accept: 'application/json', 'user-agent': COLLECTOR_UA } },
        10000
      );
      if (!r.ok) throw new Error(`HTTP ${r.status} (${u})`);
      return (await r.json()) as T;
    },
  };
}

/** Récupère + normalise les annonces d'un connecteur autorisé. */
async function fetchConnector(connector: {
  source_id: string;
  config: Record<string, unknown> | null;
  secret_ref: string | null;
}): Promise<{ listings: CanonicalListing[]; errors: string[] }> {
  const cfg = (connector.config ?? {}) as Record<string, unknown>;
  const kind = typeof cfg.kind === 'string' ? cfg.kind : 'json_api';

  if (kind !== 'json_api') {
    const { raws, warnings } = await collectSite(kind, cfg, {
      fetcher: siteFetch(),
      limit: cfg.maxListings != null ? Number(cfg.maxListings) : 200,
    });
    const { listings, errors } = parseListings(
      raws.map(r => ({ ...r, sourceId: connector.source_id }))
    );
    return { listings, errors: [...errors, ...warnings] };
  }

  const url = typeof cfg.url === 'string' ? cfg.url : '';
  await assertPublicHttpsUrl(url);

  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...((cfg.headers as Record<string, string>) ?? {}),
  };
  if (connector.secret_ref) {
    const secret = Deno.env.get(connector.secret_ref);
    if (secret) {
      const h = (cfg.authHeader as string) ?? 'Authorization';
      const scheme = (cfg.authScheme as string) ?? 'Bearer';
      headers[h] = scheme ? `${scheme} ${secret}` : secret;
    }
  }

  const res = await fetchWithTimeout(
    url,
    { method: (cfg.method as string) ?? 'GET', headers },
    10000
  );
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

/** Applique le plan en base, par LOTS (évite le N+1). Renvoie les compteurs. */
async function applyPlan(
  supabase: Supa,
  userId: string,
  searchId: string,
  plan: IngestionPlan
) {
  const idByKey = new Map<string, string>();
  const listingRows: Record<string, unknown>[] = [];
  const versionRows: Record<string, unknown>[] = [];
  let added = 0;
  let updated = 0;

  for (const up of plan.upserts) {
    let id: string;
    if (up.kind === 'insert') {
      id = crypto.randomUUID();
      added++;
    } else if (up.matchedId) {
      id = up.matchedId;
      updated++;
    } else {
      continue;
    }
    idByKey.set(up.key, id);
    listingRows.push(listingRow(userId, searchId, up, id));
    versionRows.push(versionRow(userId, id, up));
  }

  if (listingRows.length > 0) {
    const { error } = await supabase
      .from('listings')
      .upsert(listingRows, { onConflict: 'id' });
    if (error) throw new Error(`upsert listings: ${error.message}`);
  }
  if (versionRows.length > 0) {
    const { error } = await supabase
      .from('listing_versions')
      .insert(versionRows);
    if (error) throw new Error(`insert versions: ${error.message}`);
  }

  const simRows: Record<string, unknown>[] = [];
  for (const s of plan.similarities) {
    const subjectId = idByKey.get(s.subjectKey);
    if (!subjectId || subjectId === s.withId) continue;
    const [a, b] =
      subjectId < s.withId ? [subjectId, s.withId] : [s.withId, subjectId];
    simRows.push({
      user_id: userId,
      listing_a: a,
      listing_b: b,
      score: s.score,
      bucket: s.bucket,
      breakdown: s.breakdown,
    });
  }
  let similarities = 0;
  if (simRows.length > 0) {
    const { error } = await supabase
      .from('listing_similarity')
      .upsert(simRows, { onConflict: 'listing_a,listing_b' });
    if (!error) similarities = simRows.length;
  }

  const notifRows = plan.notifications.map(n => ({
    user_id: userId,
    type: n.type,
    title: n.title,
    body: n.body,
    listing_id: idByKey.get(n.subjectKey) ?? null,
    search_id: searchId,
    payload: n.payload,
  }));
  let notifications = 0;
  if (notifRows.length > 0) {
    const { error } = await supabase.from('notifications').insert(notifRows);
    if (!error) notifications = notifRows.length;
  }

  return { added, updated, similarities, notifications };
}

// Pas de first_seen_at : l'INSERT prend le défaut (now()), l'UPDATE (upsert on
// conflict id) ne le touche pas → la date de 1re détection est préservée.
function listingRow(
  userId: string,
  searchId: string,
  up: PlannedUpsert,
  id: string
) {
  const c = up.canonical;
  return {
    id,
    user_id: userId,
    source_id: c.sourceId,
    external_id: c.externalId,
    search_id: searchId,
    fingerprint: up.fingerprint,
    relevance_score: Math.round(up.relevance),
    source_status: 'active',
    currency: c.currency ?? 'EUR',
    last_seen_at: nowIso(),
    last_changed_at: nowIso(),
    raw: c,
    ...listingFields(c),
  };
}

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

function versionRow(userId: string, listingId: string, up: PlannedUpsert) {
  const c = up.canonical;
  return {
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
  };
}
