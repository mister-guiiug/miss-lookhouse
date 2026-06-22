/**
 * Dépôt Supabase : lecture (`pullAll`) et écritures (upserts). Utilise le client
 * authentifié → la RLS arbitre l'accès (chaque utilisateur ne voit que ses
 * lignes). Les écritures supposent des ids **UUID** côté client (le store en
 * génère via `crypto.randomUUID`), pour que l'upsert soit idempotent.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  AppData,
  ListingNote,
  ListingStatusEntry,
  LocalSearch,
  LocalVerification,
} from '../store/types';
import {
  listingFromRow,
  noteFromRow,
  notificationFromRow,
  searchFromRow,
  searchToRow,
  similarityFromRow,
  statusFromRow,
  verificationFromRow,
  type ListingRow,
  type NoteRow,
  type NotificationRow,
  type PriceRow,
  type SearchRow,
  type SimilarityRow,
  type StatusRow,
  type VerificationRow,
} from './mappers';

const PAGE = 1000;

/**
 * Pagine une requête PostgREST jusqu'à épuisement. PostgREST plafonne une
 * réponse à ~1000 lignes : sans pagination, l'hydratation perdrait des données
 * SILENCIEUSEMENT au-delà. On boucle par `.range()` jusqu'à une page incomplète.
 */
async function fetchAllRows<T>(
  page: (
    from: number,
    to: number
  ) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    out.push(...rows);
    if (rows.length < PAGE) break;
  }
  return out;
}

/** Lit l'intégralité des données de l'utilisateur courant (RLS + paginé). */
export async function pullAll(supabase: SupabaseClient): Promise<AppData> {
  const [
    searches,
    listings,
    priceRows,
    notifications,
    similarities,
    statusRows,
    noteRows,
    verifRows,
  ] = await Promise.all([
    fetchAllRows<SearchRow>((f, t) =>
      supabase.from('saved_searches').select('*').range(f, t)
    ),
    fetchAllRows<ListingRow>((f, t) =>
      supabase.from('listings').select('*').range(f, t)
    ),
    fetchAllRows<PriceRow>((f, t) =>
      supabase
        .from('listing_price_history')
        .select('listing_id, observed_at, price')
        .range(f, t)
    ),
    fetchAllRows<NotificationRow>((f, t) =>
      supabase
        .from('notifications')
        .select('*')
        .order('created_at', { ascending: false })
        .range(f, t)
    ),
    fetchAllRows<SimilarityRow>((f, t) =>
      supabase
        .from('listing_similarity')
        .select('id, listing_a, listing_b, score, bucket')
        .range(f, t)
    ),
    fetchAllRows<StatusRow>((f, t) =>
      supabase
        .from('listing_status')
        .select('listing_id, status, tags')
        .range(f, t)
    ),
    fetchAllRows<NoteRow>((f, t) =>
      supabase
        .from('listing_notes')
        .select('*')
        .order('created_at', { ascending: false })
        .range(f, t)
    ),
    fetchAllRows<VerificationRow>((f, t) =>
      supabase
        .from('listing_verifications')
        .select(
          'id, listing_id, verified, confidence, checklist, anomalies, flagged_reason, created_at'
        )
        .order('created_at', { ascending: false })
        .range(f, t)
    ),
  ]);

  const statusMap: Record<string, ListingStatusEntry> = {};
  for (const row of statusRows) {
    const m = statusFromRow(row);
    statusMap[m.listingId] = m.entry;
  }

  const noteMap: Record<string, ListingNote[]> = {};
  for (const row of noteRows) {
    const m = noteFromRow(row);
    const list = noteMap[m.listingId] ?? [];
    list.push(m.note);
    noteMap[m.listingId] = list;
  }

  const verifMap: Record<string, LocalVerification[]> = {};
  for (const row of verifRows) {
    const m = verificationFromRow(row);
    const list = verifMap[m.listingId] ?? [];
    list.push(m.verification);
    verifMap[m.listingId] = list;
  }

  return {
    searches: searches.map(searchFromRow),
    listings: listings.map(r => listingFromRow(r, priceRows)),
    notifications: notifications.map(notificationFromRow),
    similarities: similarities.map(similarityFromRow),
    statuses: statusMap,
    notes: noteMap,
    verifications: verifMap,
  };
}

// ── Écritures (idempotentes via upsert on id) ────────────────────────────
export async function upsertSearch(
  supabase: SupabaseClient,
  userId: string,
  search: LocalSearch
): Promise<void> {
  const { error } = await supabase
    .from('saved_searches')
    .upsert({ ...searchToRow(search), user_id: userId });
  if (error) throw new Error(error.message);
}

export async function deleteSearchRemote(
  supabase: SupabaseClient,
  id: string
): Promise<void> {
  const { error } = await supabase.from('saved_searches').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

export async function upsertStatus(
  supabase: SupabaseClient,
  userId: string,
  listingId: string,
  entry: ListingStatusEntry
): Promise<void> {
  const { error } = await supabase.from('listing_status').upsert({
    listing_id: listingId,
    user_id: userId,
    status: entry.status,
    tags: entry.tags,
  });
  if (error) throw new Error(error.message);
}

export async function addNoteRemote(
  supabase: SupabaseClient,
  userId: string,
  listingId: string,
  note: ListingNote
): Promise<void> {
  const { error } = await supabase.from('listing_notes').insert({
    id: note.id,
    user_id: userId,
    listing_id: listingId,
    body: note.body,
    created_at: note.createdAt,
  });
  if (error) throw new Error(error.message);
}

export async function setNotificationRead(
  supabase: SupabaseClient,
  id: string,
  readAt: string | null
): Promise<void> {
  const { error } = await supabase
    .from('notifications')
    .update({ read_at: readAt })
    .eq('id', id);
  if (error) throw new Error(error.message);
}

export async function addVerificationRemote(
  supabase: SupabaseClient,
  userId: string,
  listingId: string,
  v: LocalVerification
): Promise<void> {
  const { error } = await supabase.from('listing_verifications').insert({
    id: v.id,
    user_id: userId,
    listing_id: listingId,
    verified: v.verified,
    confidence: v.confidence,
    checklist: v.checklist,
    anomalies: v.anomalies,
    flagged_reason: v.flaggedReason ?? null,
    created_at: v.createdAt,
  });
  if (error) throw new Error(error.message);
}
