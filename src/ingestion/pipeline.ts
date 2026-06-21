/**
 * PIPELINE d'ingestion (pur, testable) : à partir des annonces entrantes
 * (canoniques) et de l'état EXISTANT en base, produit un PLAN d'actions —
 * insertions/mises à jour, arêtes de similarité, notifications. Le dépôt
 * (Supabase ou local) se contente d'APPLIQUER ce plan. Aucune I/O ici.
 *
 * Étapes : normalisation (faite en amont) → filtre de pertinence → détection
 * nouveau vs maj → historisation (empreinte/delta) → similarité/dédup →
 * notifications. Idempotent : rejouer le même lot produit le même plan.
 */
import type {
  CanonicalListing,
  ListingLike,
  SearchCriteria,
  SimilarityBucket,
  SimilarityFactor,
} from '../domain/types';
import { listingFingerprint } from '../domain/normalize';
import { computeSimilarity } from '../domain/similarity';
import {
  classifyChange,
  detectPriceDrop,
  detectRepublication,
  relevanceScore,
} from '../domain/scoring';

export interface ExistingListing extends ListingLike {
  id: string;
  sourceId: string;
  externalId: string;
  fingerprint?: string | null;
  sourceStatus?: string | null;
  /** Vraie si l'annonce avait disparu (utile à la détection de recyclage). */
  disappeared?: boolean;
}

export type PlannedNotificationType =
  | 'new_listing'
  | 'price_drop'
  | 'recycled'
  | 'important_change'
  | 'probable_duplicate';

export interface PlannedNotification {
  type: PlannedNotificationType;
  title: string;
  body: string;
  subjectKey: string; // sourceId:externalId
  payload: Record<string, unknown>;
}

export interface PlannedUpsert {
  kind: 'insert' | 'update';
  key: string;
  canonical: CanonicalListing;
  fingerprint: string;
  matchedId?: string;
  relevance: number;
  excluded: boolean;
}

export interface PlannedSimilarity {
  subjectKey: string;
  withId: string;
  score: number;
  bucket: SimilarityBucket;
  breakdown: SimilarityFactor[];
}

export interface IngestionPlan {
  upserts: PlannedUpsert[];
  similarities: PlannedSimilarity[];
  notifications: PlannedNotification[];
}

export interface PlanOptions {
  criteria?: SearchCriteria;
  priceDropPct?: number;
  minRelevance?: number;
  probableThreshold?: number;
}

function keyOf(x: { sourceId: string; externalId: string }): string {
  return `${x.sourceId}:${x.externalId}`;
}

/** Construit le plan d'ingestion d'un lot d'annonces. */
export function planIngestion(
  incoming: CanonicalListing[],
  existing: ExistingListing[],
  options: PlanOptions = {}
): IngestionPlan {
  const priceDropPct = options.priceDropPct ?? 3;
  const minRelevance = options.minRelevance ?? 50;
  const probableThreshold = options.probableThreshold ?? 78;

  const existingByKey = new Map(existing.map(e => [keyOf(e), e]));
  const plan: IngestionPlan = {
    upserts: [],
    similarities: [],
    notifications: [],
  };

  for (const listing of incoming) {
    const key = keyOf(listing);
    const fingerprint = listingFingerprint(listing);

    // — Pertinence (filtre) —
    const rel = options.criteria
      ? relevanceScore(listing, options.criteria)
      : { score: 100, excluded: false, factors: [], reason: 'Pas de critère' };

    const match = existingByKey.get(key);
    if (match) {
      // ───────── MISE À JOUR d'une annonce connue ─────────
      plan.upserts.push({
        kind: 'update',
        key,
        canonical: listing,
        fingerprint,
        matchedId: match.id,
        relevance: rel.score,
        excluded: rel.excluded,
      });

      const drop = detectPriceDrop(match.price, listing.price, priceDropPct);
      if (drop.dropped) {
        plan.notifications.push({
          type: 'price_drop',
          title: 'Baisse de prix',
          body: `${listing.title ?? 'Annonce'} : ${drop.deltaPct.toFixed(1)} % (${drop.deltaAbs} €)`,
          subjectKey: key,
          payload: {
            deltaPct: drop.deltaPct,
            deltaAbs: drop.deltaAbs,
            newPrice: listing.price,
          },
        });
      } else {
        const change = classifyChange(
          {
            price: match.price,
            fingerprint: match.fingerprint,
            sourceStatus: match.sourceStatus,
          },
          { price: listing.price, fingerprint, sourceStatus: 'active' },
          priceDropPct
        );
        if (
          change.kind !== 'none' &&
          !rel.excluded &&
          rel.score >= minRelevance
        ) {
          plan.notifications.push({
            type: 'important_change',
            title: 'Modification importante',
            body: `${listing.title ?? 'Annonce'} : ${change.detail}`,
            subjectKey: key,
            payload: { change: change.kind, detail: change.detail },
          });
        }
      }
      continue;
    }

    // ───────── NOUVELLE annonce ─────────
    plan.upserts.push({
      kind: 'insert',
      key,
      canonical: listing,
      fingerprint,
      relevance: rel.score,
      excluded: rel.excluded,
    });

    // Similarité vs l'existant : repère doublons / recyclages.
    const best = bestMatch(listing, existing);
    if (
      best &&
      (best.bucket === 'doublon_exact' || best.bucket === 'probable_identique')
    ) {
      plan.similarities.push({
        subjectKey: key,
        withId: best.existing.id,
        score: best.score,
        bucket: best.bucket,
        breakdown: best.factors,
      });
      const recyc = detectRepublication(
        {
          differentExternalId: best.existing.externalId !== listing.externalId,
          otherDisappeared: Boolean(best.existing.disappeared),
          similarityScore: best.score,
        },
        probableThreshold
      );
      if (recyc.recycled) {
        plan.notifications.push({
          type: 'recycled',
          title: 'Annonce recyclée probable',
          body: recyc.reason,
          subjectKey: key,
          payload: {
            withId: best.existing.id,
            score: best.score,
            confidence: recyc.confidence,
          },
        });
      } else {
        plan.notifications.push({
          type: 'probable_duplicate',
          title: 'Doublon probable',
          body: `Proche d'une annonce déjà suivie (${best.score}/100).`,
          subjectKey: key,
          payload: { withId: best.existing.id, score: best.score },
        });
      }
    } else if (!rel.excluded && rel.score >= minRelevance) {
      // Vraie nouveauté pertinente.
      plan.notifications.push({
        type: 'new_listing',
        title: 'Nouvelle annonce',
        body: `${listing.title ?? 'Annonce'}${listing.price != null ? ` — ${listing.price} €` : ''}`,
        subjectKey: key,
        payload: { relevance: rel.score },
      });
    }
  }

  return plan;
}

interface BestMatch {
  existing: ExistingListing;
  score: number;
  bucket: SimilarityBucket;
  factors: SimilarityFactor[];
}

/**
 * Meilleure correspondance d'une annonce parmi l'existant. En production, on
 * pré-filtre les candidats via la base (trigram + rayon géo + fourchette de
 * prix) ; ici on compare l'ensemble fourni (déjà restreint par l'appelant).
 */
function bestMatch(
  listing: ListingLike,
  existing: ExistingListing[]
): BestMatch | null {
  let best: BestMatch | null = null;
  for (const e of existing) {
    const res = computeSimilarity(listing, e);
    if (!best || res.score > best.score) {
      best = {
        existing: e,
        score: res.score,
        bucket: res.bucket,
        factors: res.factors,
      };
    }
  }
  return best;
}
