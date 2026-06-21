/**
 * Scores métier EXPLICABLES : pertinence (vs recherche), fraîcheur, détection de
 * baisse de prix, classification de changement, détection de republication.
 *
 * Toutes les règles, pondérations et seuils sont documentés inline et ajustables.
 * Aucune « boîte noire » : chaque score s'accompagne de son détail.
 */
import type {
  ListingLike,
  RelevanceFactor,
  RelevanceResult,
  SearchCriteria,
} from './types';
import { containsKeyword } from './text';
import { pointInPolygon, withinRadius } from './geo';

/** Ajustement linéaire 0..1 : 1 dans [min,max], décroît sur une marge au-delà. */
function rangeFit(
  value: number,
  min: number | null | undefined,
  max: number | null | undefined,
  marginFrac = 0.25
): number {
  if (min != null && value < min) {
    const margin = Math.max(1, Math.abs(min) * marginFrac);
    return Math.max(0, 1 - (min - value) / margin);
  }
  if (max != null && value > max) {
    const margin = Math.max(1, Math.abs(max) * marginFrac);
    return Math.max(0, 1 - (value - max) / margin);
  }
  return 1;
}

const RELEVANCE_WEIGHTS = {
  price: 30,
  surface: 20,
  rooms: 15,
  propertyType: 15,
  keywords: 20,
} as const;

/**
 * Score de PERTINENCE 0..100 d'une annonce vis-à-vis d'une recherche.
 * Exclusions DURES : mot-clé exclu présent, ou hors de la zone géographique
 * définie (quand les coordonnées sont connues). Sinon, somme pondérée explicable.
 */
export function relevanceScore(
  listing: ListingLike,
  criteria: SearchCriteria
): RelevanceResult {
  const factors: RelevanceFactor[] = [];
  const haystack = `${listing.title ?? ''} ${listing.description ?? ''}`;

  // — Exclusion : mots-clés exclus —
  for (const kw of criteria.keywordsExcluded ?? []) {
    if (containsKeyword(haystack, kw)) {
      return {
        score: 0,
        excluded: true,
        factors: [
          {
            factor: 'exclusion',
            ok: false,
            contribution: 0,
            detail: `mot-clé exclu présent : « ${kw} »`,
          },
        ],
        reason: `Exclue : contient « ${kw} ».`,
      };
    }
  }

  // — Exclusion : hors zone géographique —
  if (listing.lat != null && listing.lng != null) {
    const pt = { lat: listing.lat, lng: listing.lng };
    if (criteria.polygon && criteria.polygon.length >= 3) {
      if (!pointInPolygon(pt, criteria.polygon)) {
        return excludedGeo();
      }
    } else if (
      criteria.centerLat != null &&
      criteria.centerLng != null &&
      criteria.radiusKm != null
    ) {
      const center = { lat: criteria.centerLat, lng: criteria.centerLng };
      if (!withinRadius(center, pt, criteria.radiusKm)) {
        return excludedGeo();
      }
    }
  }

  // — Prix —
  if (listing.price != null) {
    const fit = rangeFit(listing.price, criteria.priceMin, criteria.priceMax);
    factors.push(
      weighted('prix', fit, RELEVANCE_WEIGHTS.price, `${listing.price} €`)
    );
  }
  // — Surface —
  if (listing.surfaceM2 != null) {
    const fit = rangeFit(
      listing.surfaceM2,
      criteria.surfaceMin,
      criteria.surfaceMax
    );
    factors.push(
      weighted(
        'surface',
        fit,
        RELEVANCE_WEIGHTS.surface,
        `${listing.surfaceM2} m²`
      )
    );
  }
  // — Pièces —
  if (listing.rooms != null) {
    const fit = rangeFit(
      listing.rooms,
      criteria.roomsMin,
      criteria.roomsMax,
      0.5
    );
    factors.push(
      weighted(
        'pièces',
        fit,
        RELEVANCE_WEIGHTS.rooms,
        `${listing.rooms} pièces`
      )
    );
  }
  // — Type de bien —
  if (listing.propertyType && (criteria.propertyTypes?.length ?? 0) > 0) {
    const ok = (criteria.propertyTypes ?? []).includes(listing.propertyType);
    factors.push(
      weighted(
        'type',
        ok ? 1 : 0,
        RELEVANCE_WEIGHTS.propertyType,
        listing.propertyType
      )
    );
  }
  // — Mots-clés requis —
  const required = criteria.keywordsRequired ?? [];
  if (required.length > 0) {
    const found = required.filter(kw => containsKeyword(haystack, kw));
    const frac = found.length / required.length;
    factors.push(
      weighted(
        'mots-clés',
        frac,
        RELEVANCE_WEIGHTS.keywords,
        `${found.length}/${required.length} mots-clés requis`
      )
    );
  }

  // Renormalisation sur les facteurs réellement évalués.
  const usedWeight = factors.reduce((s, f) => s + factorWeight(f), 0);
  const rawScore = factors.reduce((s, f) => s + f.contribution, 0);
  const score = usedWeight > 0 ? Math.round((rawScore / usedWeight) * 100) : 50;

  const top = [...factors]
    .sort((x, y) => y.contribution - x.contribution)
    .slice(0, 2)
    .map(f => f.detail);
  return {
    score,
    excluded: false,
    factors,
    reason: `Pertinence ${score}/100 — ${top.join(' ; ') || 'critères limités'}`,
  };
}

// — helpers internes de pertinence —
const FACTOR_WEIGHT = new WeakMap<RelevanceFactor, number>();
function weighted(
  factor: string,
  fit: number,
  weight: number,
  detail: string
): RelevanceFactor {
  const f: RelevanceFactor = {
    factor,
    ok: fit >= 0.5,
    contribution: Math.round(fit * weight * 10) / 10,
    detail,
  };
  FACTOR_WEIGHT.set(f, weight);
  return f;
}
function factorWeight(f: RelevanceFactor): number {
  return FACTOR_WEIGHT.get(f) ?? 0;
}
function excludedGeo(): RelevanceResult {
  return {
    score: 0,
    excluded: true,
    factors: [
      {
        factor: 'zone',
        ok: false,
        contribution: 0,
        detail: 'hors zone géographique',
      },
    ],
    reason: 'Exclue : hors de la zone surveillée.',
  };
}

/**
 * Score de FRAÎCHEUR 0..100 : décroissance exponentielle depuis le dernier
 * changement (demi-vie ≈ 50 h). Une annonce modifiée il y a 1 h ≈ 99 ;
 * il y a 3 jours ≈ 37.
 */
export function freshnessScore(lastChangedAtMs: number, nowMs: number): number {
  const hours = Math.max(0, (nowMs - lastChangedAtMs) / 3_600_000);
  return Math.round(100 * Math.exp(-hours / 72));
}

export interface PriceDrop {
  dropped: boolean;
  deltaAbs: number;
  deltaPct: number;
}

/** Détecte une baisse de prix significative (≥ `thresholdPct`, défaut 3 %). */
export function detectPriceDrop(
  prevPrice: number | null | undefined,
  newPrice: number | null | undefined,
  thresholdPct = 3
): PriceDrop {
  if (prevPrice == null || newPrice == null || prevPrice <= 0) {
    return { dropped: false, deltaAbs: 0, deltaPct: 0 };
  }
  const deltaAbs = newPrice - prevPrice;
  const deltaPct = (deltaAbs / prevPrice) * 100;
  return { dropped: deltaPct <= -thresholdPct, deltaAbs, deltaPct };
}

export type ChangeKind =
  | 'none'
  | 'price_drop'
  | 'price_rise'
  | 'text_change'
  | 'media_change'
  | 'status_change';

export interface ChangeSnapshot {
  price?: number | null;
  fingerprint?: string | null;
  mediaCount?: number | null;
  sourceStatus?: string | null;
}

/** Classe le changement principal entre deux états d'une annonce. */
export function classifyChange(
  prev: ChangeSnapshot,
  next: ChangeSnapshot,
  priceDropPct = 3
): { kind: ChangeKind; detail: string } {
  if (
    prev.sourceStatus &&
    next.sourceStatus &&
    prev.sourceStatus !== next.sourceStatus
  ) {
    return {
      kind: 'status_change',
      detail: `${prev.sourceStatus} → ${next.sourceStatus}`,
    };
  }
  const drop = detectPriceDrop(prev.price, next.price, priceDropPct);
  if (drop.dropped) {
    return {
      kind: 'price_drop',
      detail: `${drop.deltaPct.toFixed(1)} % (${drop.deltaAbs} €)`,
    };
  }
  if (prev.price != null && next.price != null && next.price > prev.price) {
    return {
      kind: 'price_rise',
      detail: `+${(next.price - prev.price).toFixed(0)} €`,
    };
  }
  if (
    prev.mediaCount != null &&
    next.mediaCount != null &&
    prev.mediaCount !== next.mediaCount
  ) {
    return {
      kind: 'media_change',
      detail: `${prev.mediaCount} → ${next.mediaCount} photos`,
    };
  }
  if (
    prev.fingerprint &&
    next.fingerprint &&
    prev.fingerprint !== next.fingerprint
  ) {
    return { kind: 'text_change', detail: 'contenu modifié' };
  }
  return { kind: 'none', detail: 'aucun changement notable' };
}

export interface RepublicationSignal {
  /** L'autre annonce a-t-elle disparu avant la publication de celle-ci ? */
  otherDisappeared: boolean;
  /** Identifiants source différents (sinon c'est la même annonce). */
  differentExternalId: boolean;
  /** Score de similarité 0..100 entre les deux annonces. */
  similarityScore: number;
}

/**
 * Détecte une REPUBLICATION / RECYCLAGE : forte similarité + identifiants
 * différents + (idéalement) l'ancienne a disparu. Sortie explicable.
 */
export function detectRepublication(
  signal: RepublicationSignal,
  probableThreshold = 78
): { recycled: boolean; confidence: number; reason: string } {
  if (!signal.differentExternalId) {
    return {
      recycled: false,
      confidence: 0,
      reason: 'Même identifiant source.',
    };
  }
  if (signal.similarityScore < probableThreshold) {
    return {
      recycled: false,
      confidence: signal.similarityScore,
      reason: `Similarité insuffisante (${signal.similarityScore}/100).`,
    };
  }
  const confidence = Math.min(
    100,
    signal.similarityScore + (signal.otherDisappeared ? 10 : 0)
  );
  const reason = signal.otherDisappeared
    ? `Annonce quasi identique (${signal.similarityScore}/100) republiée après disparition de la précédente.`
    : `Annonce quasi identique (${signal.similarityScore}/100) sous un autre identifiant.`;
  return { recycled: true, confidence, reason };
}
