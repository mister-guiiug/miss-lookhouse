/**
 * Abstraction de SOURCE : chaque connecteur sait collecter (ou parser) des
 * annonces et les renvoyer au format canonique. Les secrets ne sont accessibles
 * que via `ctx.getSecret` (présent uniquement côté serveur), jamais en clair.
 */
import type { CanonicalListing, CollectionMode } from '../../domain/types';

export interface SavedSearchInput {
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
  propertyTypes?: string[];
  keywordsRequired?: string[];
  keywordsExcluded?: string[];
}

export interface ConnectorContext {
  /** Configuration NON secrète (source_connectors.config). */
  config: Record<string, unknown>;
  /** Résout un secret serveur par référence — indéfini côté navigateur. */
  getSecret?: (ref: string) => Promise<string | undefined>;
  signal?: AbortSignal;
  now: number;
}

export interface ConnectorInput {
  /** Payload collé pour les imports manuels (JSON/CSV/URL). */
  payload?: string;
  /** Critères pour les modes recherche/API. */
  search?: SavedSearchInput;
}

export interface ConnectorResult {
  listings: CanonicalListing[];
  warnings: string[];
}

export interface SourceConnector {
  /** Identifiant technique du connecteur. */
  id: string;
  mode: CollectionMode;
  label: string;
  /** Collecte/parse et renvoie des annonces canoniques. */
  collect(
    input: ConnectorInput,
    ctx: ConnectorContext
  ): Promise<ConnectorResult>;
}
