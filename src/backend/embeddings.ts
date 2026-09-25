/**
 * Voisins d'une annonce par EMBEDDINGS (migration 0016), en mode Supabase.
 *
 * La RPC `lh_embedding_neighbors` est `security invoker` : elle s'exécute sous
 * la RLS de l'appelant, ne rend que des annonces qu'il voit, et ne rend rien
 * pour une annonce qu'il ne voit pas. Le client ne calcule aucun vecteur et
 * n'en lit aucun : il reçoit des cosinus.
 *
 * Importé par la seule carte des rapprochements, chargée à la demande : ce
 * module ne pèse pas sur le premier chargement.
 */
import { getSupabase } from './supabaseClient';
import { EMBEDDING_COSINE_FLOOR } from '../domain/embedding';

export interface EmbeddingNeighbor {
  listingId: string;
  /** Similarité cosinus (1 − distance), de −1 à 1. */
  cosine: number;
}

interface NeighborRow {
  listing_id: string;
  similarity: number | string;
}

/** Les annonces les plus proches, au-dessus du plancher de cosinus. */
export async function fetchEmbeddingNeighbors(
  listingId: string,
  options: { minCosine?: number; limit?: number } = {}
): Promise<EmbeddingNeighbor[]> {
  const s = await getSupabase();
  if (!s) return [];
  const { data, error } = await s.rpc('lh_embedding_neighbors', {
    p_listing_id: listingId,
    p_min_similarity: options.minCosine ?? EMBEDDING_COSINE_FLOOR,
    p_limit: options.limit ?? 10,
  });
  if (error) throw new Error(error.message);
  return ((data ?? []) as NeighborRow[])
    .map(r => ({ listingId: r.listing_id, cosine: Number(r.similarity) }))
    .filter(n => Number.isFinite(n.cosine));
}
