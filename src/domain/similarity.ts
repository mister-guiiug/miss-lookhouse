/**
 * Moteur de SIMILARITÉ explicable entre deux annonces.
 *
 * Principe : chaque facteur produit une similarité 0..1 et n'est compté QUE s'il
 * est comparable (données présentes des deux côtés). Le score final renormalise
 * les poids sur les seuls facteurs comparables — une donnée manquante ne pénalise
 * donc pas injustement. Le résultat porte le DÉTAIL de chaque contribution
 * (transparence : « pourquoi ce score ? »).
 *
 * Réglage : ajuster `DEFAULT_WEIGHTS` (importance relative) et
 * `DEFAULT_THRESHOLDS` (frontières des catégories). Tout est surchargé par appel.
 */
import type {
  ListingLike,
  SimilarityBucket,
  SimilarityFactor,
  SimilarityResult,
  SimilarityThresholds,
  SimilarityWeights,
} from './types';
import { textSimilarity } from './text';
import { geoSimilarity } from './geo';
import { imageSimilarity } from './imageHash';
import { squashWhitespace, stripAccents } from './normalize';

export const DEFAULT_WEIGHTS: SimilarityWeights = {
  text: 0.3,
  price: 0.12,
  surface: 0.12,
  rooms: 0.06,
  propertyType: 0.06,
  geo: 0.18,
  image: 0.12,
  contact: 0.04,
};

export const DEFAULT_THRESHOLDS: SimilarityThresholds = {
  doublonExact: 92,
  probableIdentique: 78,
  similaire: 55,
};

/** Proximité relative 0..1 de deux nombres (1 = identiques). */
function relativeProximity(a: number, b: number): number {
  if (a === 0 && b === 0) return 1;
  const denom = Math.max(Math.abs(a), Math.abs(b));
  if (denom === 0) return 1;
  return Math.max(0, 1 - Math.abs(a - b) / denom);
}

function roomsSimilarity(a: number, b: number): number {
  const diff = Math.abs(a - b);
  if (diff === 0) return 1;
  if (diff === 1) return 0.5;
  return 0;
}

function sameContact(a?: string | null, b?: string | null): number | null {
  const na = a ? squashWhitespace(stripAccents(a)) : '';
  const nb = b ? squashWhitespace(stripAccents(b)) : '';
  if (!na || !nb) return null;
  return na === nb ? 1 : 0;
}

function bucketFor(
  score: number,
  imageSim: number | null,
  geoSim: number | null,
  thresholds: SimilarityThresholds
): SimilarityBucket {
  // Règle heuristique explicite : une correspondance visuelle quasi parfaite à
  // localisation cohérente (ou inconnue) est un doublon, même si le texte a été
  // réécrit (cas classique de l'annonce recyclée).
  if (
    imageSim !== null &&
    imageSim >= 0.95 &&
    (geoSim === null || geoSim >= 0.5)
  ) {
    return 'doublon_exact';
  }
  if (score >= thresholds.doublonExact) return 'doublon_exact';
  if (score >= thresholds.probableIdentique) return 'probable_identique';
  if (score >= thresholds.similaire) return 'similaire';
  return 'different';
}

export interface SimilarityOptions {
  weights?: SimilarityWeights;
  thresholds?: SimilarityThresholds;
  /** Tolérance géographique (m) au-delà de laquelle geoSim = 0. */
  geoToleranceM?: number;
}

/**
 * Calcule la similarité explicable entre deux annonces.
 * @returns score 0..100, catégorie, et détail facteur par facteur.
 */
export function computeSimilarity(
  a: ListingLike,
  b: ListingLike,
  options: SimilarityOptions = {}
): SimilarityResult {
  const weights = options.weights ?? DEFAULT_WEIGHTS;
  const thresholds = options.thresholds ?? DEFAULT_THRESHOLDS;
  const factors: SimilarityFactor[] = [];

  // 1) Texte (toujours comparable : 0 si l'un est vide).
  const textSim = textSimilarity(
    a.title,
    a.description,
    b.title,
    b.description
  );
  factors.push({
    factor: 'texte',
    weight: weights.text,
    similarity: textSim,
    contribution: 0,
    detail: `titre + description ${(textSim * 100).toFixed(0)} % similaires`,
  });

  // 2) Prix
  if (a.price != null && b.price != null) {
    const s = relativeProximity(a.price, b.price);
    factors.push({
      factor: 'prix',
      weight: weights.price,
      similarity: s,
      contribution: 0,
      detail: `${a.price} € vs ${b.price} €`,
    });
  }

  // 3) Surface
  if (a.surfaceM2 != null && b.surfaceM2 != null) {
    const s = relativeProximity(a.surfaceM2, b.surfaceM2);
    factors.push({
      factor: 'surface',
      weight: weights.surface,
      similarity: s,
      contribution: 0,
      detail: `${a.surfaceM2} m² vs ${b.surfaceM2} m²`,
    });
  }

  // 4) Pièces
  if (a.rooms != null && b.rooms != null) {
    const s = roomsSimilarity(a.rooms, b.rooms);
    factors.push({
      factor: 'pièces',
      weight: weights.rooms,
      similarity: s,
      contribution: 0,
      detail: `${a.rooms} vs ${b.rooms} pièces`,
    });
  }

  // 5) Type de bien
  if (a.propertyType && b.propertyType) {
    const s = a.propertyType === b.propertyType ? 1 : 0;
    factors.push({
      factor: 'type',
      weight: weights.propertyType,
      similarity: s,
      contribution: 0,
      detail: `${a.propertyType} vs ${b.propertyType}`,
    });
  }

  // 6) Géographie
  let geoSim: number | null = null;
  if (a.lat != null && a.lng != null && b.lat != null && b.lng != null) {
    geoSim = geoSimilarity(
      { lat: a.lat, lng: a.lng },
      { lat: b.lat, lng: b.lng },
      options.geoToleranceM
    );
    factors.push({
      factor: 'géo',
      weight: weights.geo,
      similarity: geoSim,
      contribution: 0,
      detail: `proximité géographique ${(geoSim * 100).toFixed(0)} %`,
    });
  }

  // 7) Images (hash perceptuel)
  const imgSim = imageSimilarity(a.phashes, b.phashes);
  if (imgSim !== null) {
    factors.push({
      factor: 'images',
      weight: weights.image,
      similarity: imgSim,
      contribution: 0,
      detail: `similarité visuelle ${(imgSim * 100).toFixed(0)} %`,
    });
  }

  // 8) Contact / agence
  const contactSim = sameContact(a.contactName, b.contactName);
  if (contactSim !== null) {
    factors.push({
      factor: 'contact',
      weight: weights.contact,
      similarity: contactSim,
      contribution: 0,
      detail: contactSim === 1 ? 'même contact/agence' : 'contacts différents',
    });
  }

  // Renormalisation des poids sur les facteurs comparables.
  const totalWeight = factors.reduce((sum, f) => sum + f.weight, 0);
  let score = 0;
  for (const f of factors) {
    const contribution =
      totalWeight > 0 && f.similarity !== null
        ? (f.weight / totalWeight) * f.similarity * 100
        : 0;
    f.contribution = Math.round(contribution * 10) / 10;
    score += contribution;
  }
  const finalScore = Math.round(score);
  const bucket = bucketFor(finalScore, imgSim, geoSim, thresholds);

  // Explication : les deux facteurs qui pèsent le plus.
  const top = [...factors]
    .sort((x, y) => y.contribution - x.contribution)
    .slice(0, 2)
    .map(f => f.detail);
  const reason = `${labelForBucket(bucket)} (${finalScore}/100) — ${top.join(' ; ')}`;

  return { score: finalScore, bucket, factors, reason };
}

export function labelForBucket(bucket: SimilarityBucket): string {
  switch (bucket) {
    case 'doublon_exact':
      return 'Doublon exact';
    case 'probable_identique':
      return 'Probablement identique';
    case 'similaire':
      return 'Similaire';
    case 'different':
      return 'Différente';
  }
}
