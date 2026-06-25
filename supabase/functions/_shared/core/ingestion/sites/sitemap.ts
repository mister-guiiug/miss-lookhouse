// @generated par scripts/build-edge-core.mjs — NE PAS ÉDITER.
// Source : src/ingestion/sites/sitemap.ts · Régénérer : npm run build:edge-core

/**
 * Aide sitemap : énumère les URLs d'annonces depuis un `sitemap.xml` (urlset plat)
 * ou un `sitemapindex` (descend d'UN niveau vers les sous-sitemaps). Pur côté
 * parsing ; le réseau passe par le `SiteFetch` injecté.
 */
import type { SiteFetch } from './types.ts';

/** Extrait les `<loc>` d'un document sitemap. */
export function parseSitemapLocs(xml: string): string[] {
  return [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)]
    .map(m => m[1])
    .filter((u): u is string => Boolean(u));
}

export function isSitemapIndex(xml: string): boolean {
  return /<sitemapindex[\s>]/i.test(xml);
}

/**
 * Récupère les URLs d'annonces : suit l'index (1 niveau) si besoin, agrège les
 * `<loc>`, puis garde celles qui matchent `pattern`.
 */
export async function collectListingUrls(
  fetcher: SiteFetch,
  sitemapUrl: string,
  pattern: RegExp,
  opts: { maxChildren?: number } = {}
): Promise<string[]> {
  const xml = await fetcher.text(sitemapUrl);
  let urls: string[];
  if (isSitemapIndex(xml)) {
    const children = parseSitemapLocs(xml).slice(0, opts.maxChildren ?? 30);
    urls = [];
    for (const child of children) {
      try {
        urls.push(...parseSitemapLocs(await fetcher.text(child)));
      } catch {
        // sous-sitemap injoignable : on ignore et on continue.
      }
    }
  } else {
    urls = parseSitemapLocs(xml);
  }
  // Dédoublonne en préservant l'ordre.
  return [...new Set(urls)].filter(u => pattern.test(u));
}
