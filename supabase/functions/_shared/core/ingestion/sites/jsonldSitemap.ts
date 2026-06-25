// @generated par scripts/build-edge-core.mjs — NE PAS ÉDITER.
// Source : src/ingestion/sites/jsonldSitemap.ts · Régénérer : npm run build:edge-core

/**
 * Connecteur « sitemap → JSON-LD ». Pour les sites qui exposent des données
 * structurées schema.org sur la page détail (ex. squarehabitat.fr).
 *
 * Deux cas, AUTO-détectés :
 *  - le sitemap liste directement les URLs détail (matchent `detailUrlPattern`) ;
 *  - sinon (squarehabitat : le sous-sitemap liste des pages de RECHERCHE), on
 *    récolte les liens détail dans le HTML de ces pages intermédiaires.
 * Chaque page détail est ensuite lue en HTML brut → JSON-LD → objet canonique.
 */
import { extractJsonLd, jsonLdToRaw } from './jsonld.ts';
import { collectListingUrls, parseSitemapLocs } from './sitemap.ts';
import type { SiteCollectContext, SiteCollectResult } from './types.ts';

export interface JsonLdSitemapConfig {
  /** Sitemap listant soit les détails, soit des pages intermédiaires de recherche. */
  sitemapUrl: string;
  /** Regex (source) identifiant une URL de page DÉTAIL. */
  detailUrlPattern: string;
  /** Base pour résoudre les hrefs relatifs récoltés (défaut : origine du sitemap). */
  baseUrl?: string;
  /** Plafond de pages intermédiaires à explorer (mode récolte). */
  maxPages?: number;
  maxListings?: number;
}

export async function collectJsonLdSitemap(
  cfg: JsonLdSitemapConfig,
  ctx: SiteCollectContext
): Promise<SiteCollectResult> {
  const warnings: string[] = [];
  let detailRe: RegExp;
  try {
    detailRe = new RegExp(cfg.detailUrlPattern);
  } catch (e) {
    return { raws: [], warnings: [`detailUrlPattern invalide : ${msg(e)}`] };
  }
  const base = cfg.baseUrl ?? origin(cfg.sitemapUrl);
  const cap = Math.min(
    cfg.maxListings ?? 200,
    ctx.limit ?? Number.MAX_SAFE_INTEGER
  );

  // 1) URLs détail : via le sitemap (descend un sitemapindex imbriqué, ex. iad),
  //    sinon récolte sur les pages intermédiaires (sitemap listant des pages de
  //    recherche dont on extrait les liens détail du HTML, ex. squarehabitat).
  let detailUrls: string[];
  try {
    detailUrls = await collectListingUrls(
      ctx.fetcher,
      cfg.sitemapUrl,
      detailRe,
      {
        maxChildren: 30,
      }
    );
  } catch (e) {
    return { raws: [], warnings: [`sitemap ${cfg.sitemapUrl} : ${msg(e)}`] };
  }
  if (detailUrls.length === 0) {
    let locs: string[] = [];
    try {
      locs = parseSitemapLocs(await ctx.fetcher.text(cfg.sitemapUrl));
    } catch (e) {
      warnings.push(`sitemap ${cfg.sitemapUrl} : ${msg(e)}`);
    }
    const seen = new Set<string>();
    for (const page of locs.slice(0, cfg.maxPages ?? 20)) {
      if (seen.size >= cap) break;
      try {
        const html = await ctx.fetcher.text(page);
        for (const m of html.matchAll(/href=["']([^"']+)["']/gi)) {
          const href = resolve(m[1] ?? '', base);
          if (href && detailRe.test(href)) seen.add(href);
        }
      } catch (e) {
        warnings.push(`page ${page} : ${msg(e)}`);
      }
    }
    detailUrls = [...seen];
  }

  // 2) Lit chaque page détail → JSON-LD → objet brut.
  const raws: Array<Record<string, unknown>> = [];
  for (const url of detailUrls.slice(0, cap)) {
    try {
      const html = await ctx.fetcher.text(url);
      const raw = jsonLdToRaw(extractJsonLd(html));
      if (!raw) {
        warnings.push(`pas de JSON-LD exploitable : ${url}`);
        continue;
      }
      raws.push({ ...raw, url: raw.url ?? url });
    } catch (e) {
      warnings.push(`détail ${url} : ${msg(e)}`);
    }
  }

  return { raws, warnings };
}

function origin(url: string): string {
  try {
    return new URL(url).origin;
  } catch {
    return '';
  }
}

function resolve(href: string, base: string): string | null {
  try {
    return new URL(href, base).toString();
  } catch {
    return null;
  }
}

function msg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
