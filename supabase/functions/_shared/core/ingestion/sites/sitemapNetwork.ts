// @generated par scripts/build-edge-core.mjs — NE PAS ÉDITER.
// Source : src/ingestion/sites/sitemapNetwork.ts · Régénérer : npm run build:edge-core

/**
 * Connecteur « sitemap réseau » : grands réseaux dont le sitemap (ou un
 * sous-sitemap) liste DIRECTEMENT les pages détail, avec un `og:title` très
 * dense (ex. safti.fr : « Vente de maison 7 pièces à Margency 95580 : 193m²,
 * prix 750 000 €. Réf. : 1552306 »). On extrait depuis `og:title` (repli corps),
 * et ville/CP depuis le slug d'URL.
 *
 * Garde anti-coquille : si une page ne livre ni prix ni surface ni pièces
 * (rendu client / page bloquée, ex. orpi qui sert un shell générique), elle est
 * IGNORÉE — évite d'injecter des annonces vides.
 */
import {
  cityPostalFromText,
  cityPostalFromUrl,
  extractMeta,
  extractPriceEur,
  extractRooms,
  extractSurfaceM2,
  listingKeyFromUrl,
} from './extract.ts';
import { collectListingUrls } from './sitemap.ts';
import type { SiteCollectContext, SiteCollectResult } from './types.ts';

export interface SitemapNetworkConfig {
  /** Un ou plusieurs sitemaps (urlset plat ou sitemapindex). */
  sitemapUrl?: string;
  sitemapUrls?: string[];
  detailUrlPattern: string;
  maxListings?: number;
}

export async function collectSitemapNetwork(
  cfg: SitemapNetworkConfig,
  ctx: SiteCollectContext
): Promise<SiteCollectResult> {
  const warnings: string[] = [];
  let detailRe: RegExp;
  try {
    detailRe = new RegExp(cfg.detailUrlPattern);
  } catch (e) {
    return { raws: [], warnings: [`detailUrlPattern invalide : ${msg(e)}`] };
  }

  const sitemaps = cfg.sitemapUrls ?? (cfg.sitemapUrl ? [cfg.sitemapUrl] : []);
  const cap = Math.min(
    cfg.maxListings ?? 200,
    ctx.limit ?? Number.MAX_SAFE_INTEGER
  );

  const seen = new Set<string>();
  for (const sm of sitemaps) {
    if (seen.size >= cap * 3) break;
    try {
      for (const u of await collectListingUrls(ctx.fetcher, sm, detailRe, {
        maxChildren: 30,
      })) {
        seen.add(u);
      }
    } catch (e) {
      warnings.push(`sitemap ${sm} : ${msg(e)}`);
    }
  }

  const raws: Array<Record<string, unknown>> = [];
  for (const url of [...seen].slice(0, cap)) {
    try {
      const html = await ctx.fetcher.text(url);
      const ogTitle = extractMeta(html, 'og:title');
      const src = ogTitle ?? '';
      const price =
        extractPriceEur(src) ??
        extractPriceEur(extractMeta(html, 'product:price:amount') ?? '') ??
        extractPriceEur(html);
      const surface = extractSurfaceM2(src) ?? extractSurfaceM2(html);
      const rooms = extractRooms(src) ?? extractRooms(html);

      // Coquille / page bloquée : rien d'exploitable → on ignore.
      if (price == null && surface == null && rooms == null) {
        warnings.push(`page sans données (rendu client ?) : ${url}`);
        continue;
      }

      const fromUrl = cityPostalFromUrl(url);
      const fromText = cityPostalFromText(ogTitle);
      raws.push({
        id: listingKeyFromUrl(url),
        url,
        title: ogTitle,
        type: ogTitle, // normalizePropertyType lira « maison/appartement… »
        rooms,
        price,
        surface,
        city: fromUrl.city ?? fromText.city,
        postalCode: fromUrl.postalCode ?? fromText.postalCode,
      });
    } catch (e) {
      warnings.push(`détail ${url} : ${msg(e)}`);
    }
  }

  return { raws, warnings };
}

function msg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
