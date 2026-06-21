// @generated par scripts/build-edge-core.mjs — NE PAS ÉDITER.
// Source : src/domain/clustering.ts · Régénérer : npm run build:edge-core

/**
 * Regroupement d'annonces en CLUSTERS par union-find à partir des arêtes de
 * similarité. Deux annonces dont le score dépasse un seuil sont fusionnées dans
 * le même groupe (composantes connexes). Pur et déterministe.
 */
import type { SimilarityBucket } from './types.ts';

export interface SimilarityEdge {
  a: string;
  b: string;
  score: number;
  bucket: SimilarityBucket;
}

export interface Cluster {
  members: string[];
  /** Score de similarité maximal observé à l'intérieur du cluster. */
  maxScore: number;
  /** Catégorie « la plus forte » présente dans le cluster. */
  kind: SimilarityBucket;
}

const BUCKET_RANK: Record<SimilarityBucket, number> = {
  different: 0,
  similaire: 1,
  probable_identique: 2,
  doublon_exact: 3,
};

function strongestBucket(
  a: SimilarityBucket,
  b: SimilarityBucket
): SimilarityBucket {
  return BUCKET_RANK[a] >= BUCKET_RANK[b] ? a : b;
}

/**
 * Construit les clusters à partir d'arêtes, en ne retenant que celles dont le
 * score ≥ `minScore` (défaut 78 = « probablement identique »).
 */
export function buildClusters(
  edges: SimilarityEdge[],
  minScore = 78
): Cluster[] {
  const parent = new Map<string, string>();
  const find = (x: string): string => {
    let root = x;
    while (parent.get(root) !== undefined && parent.get(root) !== root) {
      const p = parent.get(root);
      if (p === undefined) break;
      root = p;
    }
    parent.set(x, root);
    return root;
  };
  const union = (x: string, y: string): void => {
    parent.set(find(x), find(y));
  };
  const ensure = (x: string): void => {
    if (!parent.has(x)) parent.set(x, x);
  };

  const kept = edges.filter(e => e.score >= minScore && e.a !== e.b);
  for (const e of kept) {
    ensure(e.a);
    ensure(e.b);
    union(e.a, e.b);
  }

  // Agrégation par racine.
  const groups = new Map<string, Cluster>();
  for (const node of parent.keys()) {
    const root = find(node);
    let cluster = groups.get(root);
    if (!cluster) {
      cluster = { members: [], maxScore: 0, kind: 'similaire' };
      groups.set(root, cluster);
    }
    cluster.members.push(node);
  }
  // Affine maxScore + kind à partir des arêtes retenues.
  for (const e of kept) {
    const root = find(e.a);
    const cluster = groups.get(root);
    if (!cluster) continue;
    if (e.score > cluster.maxScore) cluster.maxScore = e.score;
    cluster.kind = strongestBucket(cluster.kind, e.bucket);
  }

  // On ne renvoie que les vrais groupes (≥ 2 membres), triés stablement.
  return [...groups.values()]
    .filter(c => c.members.length >= 2)
    .map(c => ({ ...c, members: [...c.members].sort() }))
    .sort((x, y) => y.maxScore - x.maxScore);
}
