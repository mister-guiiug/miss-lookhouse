/**
 * Similarité par EMBEDDINGS — un signal de plus pour l'heuristique, en option,
 * et APRÈS elle.
 *
 * D'OÙ VIENT LE CHIFFRE. La base range, pour chaque annonce, un vecteur de 384
 * dimensions calculé par `gte-small`, le modèle intégré au runtime Edge de
 * Supabase (fonction `embed`, migration 0016). La RPC `lh_embedding_neighbors`
 * rend le COSINUS entre deux annonces. Ce module ne calcule aucun vecteur : il
 * décide ce que vaut ce cosinus face aux autres signaux, et il le dit.
 *
 * CE QUE `gte-small` SAIT FAIRE, ET CE QU'IL NE SAIT PAS. Il est entraîné
 * surtout sur l'anglais. Deux annonces françaises qui se recouvrent presque mot
 * pour mot — un doublon, une republication — lui donnent un cosinus très
 * proche de 1 : c'est ce cas-là qu'on lui demande, et il y suffit. Juger que
 * deux textes FRANÇAIS disent la même chose avec d'autres mots, il ne le fait
 * pas de façon fiable. Ses cosinus sont en outre TASSÉS vers le haut : deux
 * annonces immobilières sans rapport dépassent couramment 0,8 — d'où le
 * plancher ci-dessous, en dessous duquel un cosinus ne prouve rien.
 *
 * LE MÉLANGE. Le cosinus devient un facteur `embeddings`, de la même famille
 * que `texte`, `prix` ou `géo` : une similarité 0..1 et un POIDS,
 * `EMBEDDING_WEIGHT` = 0,2, à l'échelle des poids de l'heuristique (dont la
 * somme vaut 1). Les poids sont renormalisés sur les facteurs comparables,
 * comme partout dans le moteur : le score mêlé est la moyenne pondérée du score
 * heuristique (pesé par la somme des poids de ses facteurs comparables) et du
 * facteur d'embedding (pesé 0,2). Sur une fiche complète, l'embedding pèse donc
 * 0,2 / 1,2 ≈ 17 % du score : il déplace un score d'au plus une quinzaine de
 * points, et ne décide jamais seul.
 *
 * NI MAGIE NI VÉTO. Sans cosinus connu — embedding pas encore calculé, voisin
 * sous le seuil de la RPC —, le facteur est NON COMPARABLE et le score reste
 * celui de l'heuristique : une donnée absente ne pénalise pas, c'est la règle
 * du moteur. Les valeurs (plancher, poids) sont posées a priori, pas mesurées
 * sur un corpus : elles sont exportées pour être relues et ajustées.
 */
import type {
  SimilarityFactor,
  SimilarityResult,
  SimilarityThresholds,
} from './types';
import { finalizeSimilarity } from './similarity';

/** Modèle intégré de Supabase Edge Runtime : aucune clé, aucun secret. */
export const EMBEDDING_MODEL = 'gte-small';

/** Dimension des vecteurs de `gte-small` — celle de la colonne `vector(384)`. */
export const EMBEDDING_DIMENSIONS = 384;

/**
 * Plancher du cosinus : à ce niveau et en dessous, le rapprochement ne compte
 * pas (similarité 0). Au-dessus, l'échelle est ramenée linéairement sur 0..1.
 * C'est aussi le seuil par défaut demandé à la RPC des voisins.
 */
export const EMBEDDING_COSINE_FLOOR = 0.85;

/** Poids du facteur, à l'échelle des poids de l'heuristique (somme = 1). */
export const EMBEDDING_WEIGHT = 0.2;

/** Nom du facteur dans le détail d'un score (`SimilarityFactor.factor`). */
export const EMBEDDING_FACTOR = 'embeddings';

/** D'où vient un score : l'heuristique seule, ou l'heuristique + embeddings. */
export type SimilarityOrigin = 'heuristique' | 'heuristique+embeddings';

export interface BlendedSimilarity extends SimilarityResult {
  origin: SimilarityOrigin;
  /** Cosinus brut rendu par la base ; `null` si non comparable. */
  cosine: number | null;
}

export interface EmbeddingBlendOptions {
  weight?: number;
  floor?: number;
  thresholds?: SimilarityThresholds;
}

/**
 * Cosinus → similarité 0..1 du facteur. Linéaire au-dessus du plancher, nulle
 * en dessous, bornée à 1 (les arrondis flottants dépassent parfois 1).
 */
export function embeddingSimilarityFromCosine(
  cosine: number,
  floor: number = EMBEDDING_COSINE_FLOOR
): number {
  if (!Number.isFinite(cosine) || cosine <= floor || floor >= 1) return 0;
  return Math.min(1, (cosine - floor) / (1 - floor));
}

/**
 * Mêle le cosinus d'embedding au résultat de l'heuristique. Le résultat garde
 * le détail facteur par facteur, avec le facteur `embeddings` quand il a
 * compté, et dit son origine.
 *
 * Idempotente : un facteur `embeddings` déjà présent est remplacé, jamais
 * compté deux fois.
 */
export function blendEmbeddingSimilarity(
  heuristic: SimilarityResult,
  cosine: number | null | undefined,
  options: EmbeddingBlendOptions = {}
): BlendedSimilarity {
  const weight = options.weight ?? EMBEDDING_WEIGHT;
  const floor = options.floor ?? EMBEDDING_COSINE_FLOOR;
  const base = heuristic.factors.filter(f => f.factor !== EMBEDDING_FACTOR);

  if (cosine == null || !Number.isFinite(cosine) || weight <= 0) {
    return {
      ...finalizeSimilarity(base, options.thresholds),
      origin: 'heuristique',
      cosine: null,
    };
  }

  const similarity = embeddingSimilarityFromCosine(cosine, floor);
  const factor: SimilarityFactor = {
    factor: EMBEDDING_FACTOR,
    weight,
    similarity,
    contribution: 0,
    detail: `textes proches à ${(similarity * 100).toFixed(0)} % selon les embeddings (cosinus ${cosine.toFixed(3)})`,
  };
  return {
    ...finalizeSimilarity([...base, factor], options.thresholds),
    origin: 'heuristique+embeddings',
    cosine,
  };
}

/**
 * Un vecteur rendu par le modèle est-il bon à ranger ? Longueur exacte et
 * nombres finis : la colonne `vector(384)` refuserait le reste, et un seul
 * refus ferait échouer tout le lot écrit par la fonction `embed`.
 */
export function isValidEmbedding(
  value: unknown,
  dimensions: number = EMBEDDING_DIMENSIONS
): value is number[] {
  return (
    Array.isArray(value) &&
    value.length === dimensions &&
    value.every(x => typeof x === 'number' && Number.isFinite(x))
  );
}
