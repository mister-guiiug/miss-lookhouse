/**
 * Mappers PURS entre les lignes Supabase (snake_case) et les types locaux
 * (camelCase). Isolés et testés : ce sont eux qui garantissent l'alignement
 * schéma ↔ store. Aucun appel réseau ici.
 */
import type {
  ListingNote,
  ListingStatusEntry,
  LocalListing,
  LocalNotification,
  LocalSearch,
  LocalSimilarity,
  LocalVerification,
  NotificationDelivery,
  PricePoint,
  UserStatus,
  WatchFrequency,
  LhNotificationType,
} from '../store/types';
import type { SimilarityBucket } from '../domain/types';

// ── Lignes DB (sous-ensembles utiles) ───────────────────────────────────
export interface SearchRow {
  id: string;
  name: string;
  source_ids: string[] | null;
  city: string | null;
  postal_code: string | null;
  center_lat: number | null;
  center_lng: number | null;
  radius_km: number | null;
  polygon: Array<[number, number]> | null;
  price_min: number | null;
  price_max: number | null;
  surface_min: number | null;
  surface_max: number | null;
  rooms_min: number | null;
  rooms_max: number | null;
  property_types: string[] | null;
  keywords_required: string[] | null;
  keywords_excluded: string[] | null;
  frequency: WatchFrequency;
  active: boolean;
  last_run_at: string | null;
}

export interface ListingRow {
  id: string;
  source_id: string;
  external_id: string;
  url: string | null;
  title: string | null;
  description: string | null;
  price: number | null;
  currency: string | null;
  surface_m2: number | null;
  rooms: number | null;
  bedrooms: number | null;
  property_type: string | null;
  floor: string | null;
  dpe: string | null;
  charges: number | null;
  agency_fees: number | null;
  lat: number | null;
  lng: number | null;
  postal_code: string | null;
  city: string | null;
  address_approx: string | null;
  is_pro: boolean | null;
  contact_name: string | null;
  published_at: string | null;
  source_updated_at: string | null;
  source_status: 'active' | 'removed' | 'unknown';
  fingerprint: string | null;
  first_seen_at: string;
  last_seen_at: string;
  last_changed_at: string;
  disappeared_at: string | null;
  search_id: string | null;
  cluster_id: string | null;
  relevance_score: number | null;
  freshness_score: number | null;
}

export interface PriceRow {
  listing_id: string;
  observed_at: string;
  price: number;
}

export interface NotificationRow {
  id: string;
  type: LhNotificationType;
  title: string;
  body: string | null;
  listing_id: string | null;
  read_at: string | null;
  created_at: string;
  dispatched_at?: string | null;
  delivery?: NotificationDelivery | null;
}

export interface SimilarityRow {
  id: number | string;
  listing_a: string;
  listing_b: string;
  score: number;
  bucket: SimilarityBucket;
}

export interface StatusRow {
  listing_id: string;
  status: UserStatus;
  tags: string[] | null;
}

export interface NoteRow {
  id: string;
  listing_id: string;
  body: string;
  created_at: string;
}

export interface VerificationRow {
  id: string;
  listing_id: string;
  verified: boolean;
  confidence: number | null;
  checklist: Record<string, boolean> | null;
  anomalies: string[] | null;
  flagged_reason: string | null;
  created_at: string;
}

// ── DB → Local ───────────────────────────────────────────────────────────
export function searchFromRow(r: SearchRow): LocalSearch {
  return {
    id: r.id,
    name: r.name,
    sourceIds: r.source_ids ?? [],
    city: r.city,
    postalCode: r.postal_code,
    centerLat: r.center_lat,
    centerLng: r.center_lng,
    radiusKm: r.radius_km,
    polygon: r.polygon ?? null,
    priceMin: r.price_min,
    priceMax: r.price_max,
    surfaceMin: r.surface_min,
    surfaceMax: r.surface_max,
    roomsMin: r.rooms_min,
    roomsMax: r.rooms_max,
    propertyTypes: r.property_types ?? [],
    keywordsRequired: r.keywords_required ?? [],
    keywordsExcluded: r.keywords_excluded ?? [],
    frequency: r.frequency,
    active: r.active,
    lastRunAt: r.last_run_at,
  };
}

export function listingFromRow(
  r: ListingRow,
  prices: PriceRow[] = []
): LocalListing {
  const priceHistory: PricePoint[] = prices
    .filter(p => p.listing_id === r.id)
    .map(p => ({ observedAt: p.observed_at, price: p.price }))
    .sort((a, b) => a.observedAt.localeCompare(b.observedAt));
  return {
    id: r.id,
    sourceId: r.source_id,
    externalId: r.external_id,
    url: r.url,
    title: r.title,
    description: r.description,
    price: r.price,
    currency: r.currency ?? 'EUR',
    surfaceM2: r.surface_m2,
    rooms: r.rooms,
    bedrooms: r.bedrooms,
    propertyType: r.property_type,
    floor: r.floor,
    dpe: r.dpe,
    charges: r.charges,
    agencyFees: r.agency_fees,
    lat: r.lat,
    lng: r.lng,
    postalCode: r.postal_code,
    city: r.city,
    addressApprox: r.address_approx,
    isPro: r.is_pro,
    contactName: r.contact_name,
    publishedAt: r.published_at,
    sourceUpdatedAt: r.source_updated_at,
    mediaUrls: [],
    phashes: [],
    firstSeenAt: r.first_seen_at,
    lastSeenAt: r.last_seen_at,
    lastChangedAt: r.last_changed_at,
    sourceStatus: r.source_status,
    relevanceScore: r.relevance_score ?? undefined,
    freshnessScore: r.freshness_score ?? undefined,
    fingerprint: r.fingerprint ?? undefined,
    priceHistory,
    clusterId: r.cluster_id ?? undefined,
    disappeared: r.disappeared_at != null,
  };
}

export function notificationFromRow(r: NotificationRow): LocalNotification {
  return {
    id: r.id,
    type: r.type,
    title: r.title,
    body: r.body ?? '',
    listingId: r.listing_id ?? undefined,
    createdAt: r.created_at,
    readAt: r.read_at,
    dispatchedAt: r.dispatched_at ?? null,
    delivery: r.delivery ?? null,
  };
}

export function similarityFromRow(r: SimilarityRow): LocalSimilarity {
  return {
    id: String(r.id),
    aId: r.listing_a,
    bId: r.listing_b,
    score: r.score,
    bucket: r.bucket,
  };
}

export function statusFromRow(r: StatusRow): {
  listingId: string;
  entry: ListingStatusEntry;
} {
  return {
    listingId: r.listing_id,
    entry: { status: r.status, tags: r.tags ?? [] },
  };
}

export function noteFromRow(r: NoteRow): {
  listingId: string;
  note: ListingNote;
} {
  return {
    listingId: r.listing_id,
    note: { id: r.id, body: r.body, createdAt: r.created_at },
  };
}

export function verificationFromRow(r: VerificationRow): {
  listingId: string;
  verification: LocalVerification;
} {
  return {
    listingId: r.listing_id,
    verification: {
      id: r.id,
      verified: r.verified,
      confidence: r.confidence,
      checklist: r.checklist ?? {},
      anomalies: r.anomalies ?? [],
      flaggedReason: r.flagged_reason,
      createdAt: r.created_at,
    },
  };
}

// ── Local → DB (payloads d'upsert ; user_id ajouté par le dépôt) ─────────
export function searchToRow(s: LocalSearch): Record<string, unknown> {
  return {
    id: s.id,
    name: s.name,
    source_ids: s.sourceIds,
    city: s.city,
    postal_code: s.postalCode,
    center_lat: s.centerLat,
    center_lng: s.centerLng,
    radius_km: s.radiusKm,
    polygon: s.polygon ?? null,
    price_min: s.priceMin,
    price_max: s.priceMax,
    surface_min: s.surfaceMin,
    surface_max: s.surfaceMax,
    rooms_min: s.roomsMin,
    rooms_max: s.roomsMax,
    property_types: s.propertyTypes,
    keywords_required: s.keywordsRequired,
    keywords_excluded: s.keywordsExcluded,
    frequency: s.frequency,
    active: s.active,
    last_run_at: s.lastRunAt,
  };
}
