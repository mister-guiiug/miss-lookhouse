// @generated par scripts/build-edge-core.mjs — NE PAS ÉDITER.
// Source : src/ingestion/sites/types.ts · Régénérer : npm run build:edge-core

/**
 * Connecteurs de SITE — collecte multi-étapes (API/sitemap/HTML) là où il n'y a
 * pas d'API JSON unique. Découplé du runtime : le fetch est INJECTÉ (`SiteFetch`)
 * → l'Edge fournit un fetch anti-SSRF + timeout (cf. _shared/net), les tests un
 * fetch sur fixtures. Le connecteur produit des objets BRUTS normalisés ensuite
 * par `parseListings` (schéma zod) — il n'écrit jamais en base lui-même.
 */

export interface SiteFetch {
  text(url: string): Promise<string>;
  json<T = unknown>(url: string): Promise<T>;
}

export interface SiteCollectContext {
  fetcher: SiteFetch;
  /** Plafond d'annonces (borne le nombre de fetch « détail » côté Edge). */
  limit?: number;
  /** Périmètre : départements (ex. ['63','03']) ; vide/absent = national (full). */
  departments?: string[];
}

export interface SiteCollectResult {
  /** Objets bruts compatibles avec `parseListings` (sourceId ajouté par l'appelant). */
  raws: Array<Record<string, unknown>>;
  warnings: string[];
}
