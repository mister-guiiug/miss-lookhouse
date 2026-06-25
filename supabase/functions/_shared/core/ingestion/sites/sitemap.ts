// @generated par scripts/build-edge-core.mjs — NE PAS ÉDITER.
// Source : src/ingestion/sites/sitemap.ts · Régénérer : npm run build:edge-core

/**
 * Aide sitemap : énumère les URLs d'annonces depuis un `sitemap.xml` (urlset plat)
 * ou un `sitemapindex` (descend d'UN niveau vers les sous-sitemaps). Pur côté
 * parsing ; le réseau passe par le `SiteFetch` injecté.
 */
import type { SiteFetch } from './types.ts';
import { inDepartments } from './extract.ts';

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

function originOf(url: string): string {
  try {
    return new URL(url).origin;
  } catch {
    return '';
  }
}

function resolveUrl(href: string, base: string): string | null {
  try {
    return new URL(href, base).toString();
  } catch {
    return null;
  }
}

/**
 * Résout les URLs de pages DÉTAIL d'un sitemap :
 *  1) directement (descend un sitemapindex) si le sitemap les liste ;
 *  2) sinon RÉCOLTE les liens détail dans le HTML des pages intermédiaires
 *     (catégorie/recherche) que le sitemap énumère — `seedPattern` restreint
 *     les pages à crawler. Pour les sites « needsCrawl » (citya, lamy…).
 */
export async function resolveDetailUrls(
  fetcher: SiteFetch,
  sitemapUrl: string,
  pattern: RegExp,
  opts: {
    base?: string;
    maxChildren?: number;
    maxPages?: number;
    cap?: number;
    seedPattern?: RegExp;
    departments?: string[];
  } = {}
): Promise<string[]> {
  // Pré-filtre « périmètre » : ne garde que les URLs dont le CP (souvent présent
  // dans l'URL : safti/citya/netty/lamy) appartient aux départements demandés.
  const byDept = (urls: string[]) =>
    opts.departments?.length
      ? urls.filter(u => inDepartments(u, opts.departments))
      : urls;

  const direct = await collectListingUrls(fetcher, sitemapUrl, pattern, {
    maxChildren: opts.maxChildren ?? 30,
  });
  if (direct.length > 0) return byDept(direct);

  let locs: string[] = [];
  try {
    locs = parseSitemapLocs(await fetcher.text(sitemapUrl));
  } catch {
    return [];
  }
  const base = opts.base ?? originOf(sitemapUrl);
  const cap = opts.cap ?? Number.MAX_SAFE_INTEGER;
  const pages = opts.seedPattern
    ? locs.filter(u => opts.seedPattern!.test(u))
    : locs;
  const seen = new Set<string>();
  for (const page of pages.slice(0, opts.maxPages ?? 20)) {
    if (seen.size >= cap) break;
    try {
      const html = await fetcher.text(page);
      for (const m of html.matchAll(/href=["']([^"']+)["']/gi)) {
        const href = resolveUrl(m[1] ?? '', base);
        if (href && pattern.test(href)) seen.add(href);
      }
    } catch {
      // page injoignable : on ignore.
    }
  }
  return byDept([...seen]);
}
