/** Types orientés UI/état local (miroir simplifié du schéma Supabase). */
import type { CanonicalListing, SimilarityBucket } from '../domain/types';

export type UserStatus =
  | 'a_revoir'
  | 'interessante'
  | 'ignoree'
  | 'doublon'
  | 'suspecte'
  | 'verifiee'
  | 'visitee'
  | 'offre_faite'
  | 'rejetee';

export type LhNotificationType =
  | 'new_listing'
  | 'price_drop'
  | 'recycled'
  | 'important_change'
  | 'probable_duplicate'
  | 'suspicious'
  | 'digest';

export type WatchFrequency = 'hourly' | 'daily' | 'manual';

export interface PricePoint {
  observedAt: string;
  price: number;
}

export interface LocalListing extends CanonicalListing {
  id: string;
  firstSeenAt: string;
  lastSeenAt: string;
  lastChangedAt: string;
  sourceStatus: 'active' | 'removed' | 'unknown';
  relevanceScore?: number;
  freshnessScore?: number;
  fingerprint?: string;
  priceHistory: PricePoint[];
  clusterId?: string;
  disappeared?: boolean;
}

export interface LocalSearch {
  id: string;
  name: string;
  sourceIds: string[];
  city?: string | null;
  postalCode?: string | null;
  centerLat?: number | null;
  centerLng?: number | null;
  radiusKm?: number | null;
  priceMin?: number | null;
  priceMax?: number | null;
  surfaceMin?: number | null;
  surfaceMax?: number | null;
  roomsMin?: number | null;
  roomsMax?: number | null;
  propertyTypes: string[];
  keywordsRequired: string[];
  keywordsExcluded: string[];
  frequency: WatchFrequency;
  active: boolean;
  lastRunAt?: string | null;
}

export interface LocalNotification {
  id: string;
  type: LhNotificationType;
  title: string;
  body: string;
  listingId?: string;
  createdAt: string;
  readAt?: string | null;
}

export interface LocalSimilarity {
  id: string;
  aId: string;
  bId: string;
  score: number;
  bucket: SimilarityBucket;
}

export interface ListingStatusEntry {
  status: UserStatus;
  tags: string[];
}

export interface ListingNote {
  id: string;
  body: string;
  createdAt: string;
}

export interface AppData {
  searches: LocalSearch[];
  listings: LocalListing[];
  notifications: LocalNotification[];
  similarities: LocalSimilarity[];
  statuses: Record<string, ListingStatusEntry>;
  notes: Record<string, ListingNote[]>;
}
