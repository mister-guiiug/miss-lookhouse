/**
 * LES RAPPROCHEMENTS D'UNE ANNONCE, quand la similarité par embeddings est
 * active : l'union des arêtes de l'heuristique (retenues à l'ingestion) et des
 * voisins rendus par les embeddings, chacun re-noté par le MÊME moteur et
 * mêlé au cosinus quand il est connu. Pur : ni réseau ni état.
 *
 * Chaque rapprochement dit d'où il vient — l'heuristique, les embeddings, ou
 * les deux — et pourquoi : les facteurs qui pèsent le plus, le facteur
 * d'embedding toujours montré quand il a compté.
 */
import { computeSimilarity } from '../../domain/similarity';
import {
  EMBEDDING_FACTOR,
  blendEmbeddingSimilarity,
  type BlendedSimilarity,
} from '../../domain/embedding';
import type { LocalListing, LocalSimilarity } from '../../store/types';

export interface EmbeddingNeighborLike {
  listingId: string;
  cosine: number;
}

export interface Rapprochement {
  other: LocalListing;
  result: BlendedSimilarity;
  /** Arête retenue par l'ingestion (l'heuristique l'avait déjà rapprochée). */
  viaHeuristique: boolean;
  /** Voisin rendu par les embeddings (cosinus connu). */
  viaEmbeddings: boolean;
}

export function rapprocher(
  listing: LocalListing,
  edges: readonly LocalSimilarity[],
  neighbors: readonly EmbeddingNeighborLike[],
  byId: ReadonlyMap<string, LocalListing>
): Rapprochement[] {
  const cosineById = new Map<string, number>();
  for (const n of neighbors) {
    if (n.listingId === listing.id || !Number.isFinite(n.cosine)) continue;
    const prev = cosineById.get(n.listingId);
    if (prev === undefined || n.cosine > prev)
      cosineById.set(n.listingId, n.cosine);
  }
  const edgePartners = new Set<string>();
  for (const e of edges) {
    if (e.aId === listing.id) edgePartners.add(e.bId);
    else if (e.bId === listing.id) edgePartners.add(e.aId);
  }

  const out: Rapprochement[] = [];
  for (const id of new Set([...edgePartners, ...cosineById.keys()])) {
    const other = byId.get(id);
    // Absente du magasin : pas chargée, ou plus visible. On ne montre que ce
    // qu'on peut ouvrir.
    if (!other || id === listing.id) continue;
    const viaHeuristique = edgePartners.has(id);
    const cosine = cosineById.get(id) ?? null;
    const result = blendEmbeddingSimilarity(
      computeSimilarity(listing, other),
      cosine
    );
    // Un voisin trouvé par les SEULS embeddings ne s'affiche que s'il tient la
    // comparaison complète : les cosinus de gte-small sont tassés vers le
    // haut, et un rapprochement classé « différente » ne serait que du bruit.
    if (!viaHeuristique && result.bucket === 'different') continue;
    out.push({ other, result, viaHeuristique, viaEmbeddings: cosine !== null });
  }

  return out.sort(
    (x, y) =>
      y.result.score - x.result.score ||
      (x.other.title ?? '').localeCompare(y.other.title ?? '')
  );
}

/**
 * Pourquoi ce rapprochement : les deux facteurs qui pèsent le plus, et celui
 * des embeddings dès qu'il est entré dans le calcul, même en troisième, même
 * à zéro — c'est lui que l'utilisateur a demandé à voir.
 */
export function pourquoi(result: BlendedSimilarity): string[] {
  const top = [...result.factors]
    .filter(f => f.contribution > 0)
    .sort((a, b) => b.contribution - a.contribution)
    .slice(0, 2);
  const emb = result.factors.find(f => f.factor === EMBEDDING_FACTOR);
  if (emb && !top.includes(emb)) top.push(emb);
  return top.map(f => f.detail);
}

/** L'origine, en clair. */
export function origine(r: Rapprochement): string {
  if (r.viaHeuristique && r.viaEmbeddings) return 'heuristique + embeddings';
  if (r.viaEmbeddings) return 'trouvée par les embeddings';
  return 'heuristique seule';
}
