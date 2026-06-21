/**
 * Types du domaine Miss LookHouse — modèle canonique d'annonce + structures de
 * scoring/similarité. Volontairement découplés du stockage (Supabase) et de l'UI
 * pour rester PURS et testables.
 */

export type CollectionMode =
  | 'manual_import'
  | 'browser_capture'
  | 'authorized_api'
  | 'saved_search_url'
  | 'server_fetch';

/** Annonce normalisée telle que produite par un connecteur, avant persistance. */
export interface CanonicalListing {
  sourceId: string;
  externalId: string;
  url?: string | null;
  title?: string | null;
  description?: string | null;
  price?: number | null;
  currency: string;
  surfaceM2?: number | null;
  rooms?: number | null;
  bedrooms?: number | null;
  propertyType?: string | null;
  floor?: string | null;
  dpe?: string | null;
  charges?: number | null;
  agencyFees?: number | null;
  lat?: number | null;
  lng?: number | null;
  postalCode?: string | null;
  city?: string | null;
  addressApprox?: string | null;
  isPro?: boolean | null;
  contactName?: string | null;
  publishedAt?: string | null;
  sourceUpdatedAt?: string | null;
  mediaUrls?: string[];
  /** Empreintes perceptuelles (dHash hex) des médias, si calculées. */
  phashes?: string[];
}

/** Sous-ensemble de champs nécessaire au moteur de similarité/scoring. */
export interface ListingLike {
  title?: string | null;
  description?: string | null;
  price?: number | null;
  surfaceM2?: number | null;
  rooms?: number | null;
  bedrooms?: number | null;
  propertyType?: string | null;
  lat?: number | null;
  lng?: number | null;
  postalCode?: string | null;
  isPro?: boolean | null;
  contactName?: string | null;
  phashes?: string[] | null;
}

/** Critères d'une recherche surveillée (sous-ensemble utile au scoring). */
export interface SearchCriteria {
  priceMin?: number | null;
  priceMax?: number | null;
  surfaceMin?: number | null;
  surfaceMax?: number | null;
  roomsMin?: number | null;
  roomsMax?: number | null;
  propertyTypes?: string[];
  keywordsRequired?: string[];
  keywordsExcluded?: string[];
  centerLat?: number | null;
  centerLng?: number | null;
  radiusKm?: number | null;
  /** Polygone GeoJSON optionnel : anneau de paires [lng, lat]. */
  polygon?: Array<[number, number]> | null;
}

export type SimilarityBucket =
  | 'doublon_exact'
  | 'probable_identique'
  | 'similaire'
  | 'different';

/** Un facteur explicable de la similarité (transparence du score). */
export interface SimilarityFactor {
  factor: string;
  weight: number;
  /** Similarité 0..1 sur ce facteur (null si non comparable). */
  similarity: number | null;
  /** Contribution effective au score final, en points (0..100). */
  contribution: number;
  detail: string;
}

export interface SimilarityResult {
  score: number; // 0..100
  bucket: SimilarityBucket;
  factors: SimilarityFactor[];
  reason: string;
}

export interface SimilarityWeights {
  text: number;
  price: number;
  surface: number;
  rooms: number;
  propertyType: number;
  geo: number;
  image: number;
  contact: number;
}

export interface SimilarityThresholds {
  doublonExact: number;
  probableIdentique: number;
  similaire: number;
}

/** Détail explicable d'un score de pertinence d'une annonce vs une recherche. */
export interface RelevanceFactor {
  factor: string;
  ok: boolean;
  contribution: number;
  detail: string;
}

export interface RelevanceResult {
  score: number; // 0..100
  factors: RelevanceFactor[];
  /** true si l'annonce est EXCLUE (mot-clé exclu, hors zone, hors budget dur). */
  excluded: boolean;
  reason: string;
}
