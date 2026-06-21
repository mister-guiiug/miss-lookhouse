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
} from '../store/types';
import {
  listingFromRow,
  noteFromRow,
  notificationFromRow,
  searchFromRow,
  searchToRow,
  similarityFromRow,
  statusFromRow,
  type ListingRow,
  type NoteRow,
  type NotificationRow,
  type PriceRow,
  type SearchRow,
  type SimilarityRow,
  type StatusRow,
} from './mappers';

/** Lit l'intégralité des données de l'utilisateur courant (arbitré par la RLS). */
export async function pullAll(supabase: SupabaseClient): Promise<AppData> {
  const [
    searches,
    listings,
    prices,
    notifications,
    similarities,
    statuses,
    notes,
  ] = await Promise.all([
    supabase.from('saved_searches').select('*'),
    supabase.from('listings').select('*'),
    supabase
      .from('listing_price_history')
      .select('listing_id, observed_at, price'),
    supabase
      .from('notifications')
      .select('*')
      .order('created_at', { ascending: false }),
    supabase
      .from('listing_similarity')
      .select('id, listing_a, listing_b, score, bucket'),
    supabase.from('listing_status').select('listing_id, status, tags'),
    supabase
      .from('listing_notes')
      .select('*')
      .order('created_at', { ascending: false }),
  ]);

  const failed = [
    searches,
    listings,
    prices,
    notifications,
    similarities,
    statuses,
    notes,
  ].find(r => r.error);
  if (failed?.error) throw new Error(failed.error.message);

  const priceRows = (prices.data ?? []) as PriceRow[];

  const statusMap: Record<string, ListingStatusEntry> = {};
  for (const row of (statuses.data ?? []) as StatusRow[]) {
    const m = statusFromRow(row);
    statusMap[m.listingId] = m.entry;
  }

  const noteMap: Record<string, ListingNote[]> = {};
  for (const row of (notes.data ?? []) as NoteRow[]) {
    const m = noteFromRow(row);
    const list = noteMap[m.listingId] ?? [];
    list.push(m.note);
    noteMap[m.listingId] = list;
  }

  return {
    searches: ((searches.data ?? []) as SearchRow[]).map(searchFromRow),
    listings: ((listings.data ?? []) as ListingRow[]).map(r =>
      listingFromRow(r, priceRows)
    ),
    notifications: ((notifications.data ?? []) as NotificationRow[]).map(
      notificationFromRow
    ),
    similarities: ((similarities.data ?? []) as SimilarityRow[]).map(
      similarityFromRow
    ),
    statuses: statusMap,
    notes: noteMap,
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
