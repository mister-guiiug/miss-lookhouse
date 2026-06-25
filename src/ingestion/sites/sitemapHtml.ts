/**
 * Connecteur générique « sitemap plat → pages HTML » pour les CMS sans données
 * structurées (La Boite Immo, Netty…). Énumère les pages détail via le sitemap,
 * puis extrait les champs depuis le `<title>` (souvent dense, ex. « Vente maison
 * Bertignat 4 pièces 140m² 140000€ ») avec repli sur le corps HTML.
 *
 * Paramétré par `config` : `sitemapUrl` + `detailUrlPattern` (regex) → réutilisable
 * pour plusieurs agences sans nouveau code.
 */
import {
  cityFromVenteTitle,
  extractPriceEur,
  extractRooms,
  extractSurfaceM2,
  extractTitleTag,
  listingKeyFromUrl,
} from './extract';
import { collectListingUrls } from './sitemap';
import type { SiteCollectContext, SiteCollectResult } from './types';

export interface SitemapHtmlConfig {
  sitemapUrl: string;
  /** Regex (source) identifiant les URLs de pages DÉTAIL (vs index/catégories). */
  detailUrlPattern: string;
  maxListings?: number;
}

export async function collectSitemapHtml(
  cfg: SitemapHtmlConfig,
  ctx: SiteCollectContext
): Promise<SiteCollectResult> {
  const warnings: string[] = [];
  let pattern: RegExp;
  try {
    pattern = new RegExp(cfg.detailUrlPattern);
  } catch (e) {
    return { raws: [], warnings: [`detailUrlPattern invalide : ${msg(e)}`] };
  }

  let urls: string[];
  try {
    urls = await collectListingUrls(ctx.fetcher, cfg.sitemapUrl, pattern, {
      maxChildren: 30,
    });
  } catch (e) {
    return { raws: [], warnings: [`sitemap ${cfg.sitemapUrl} : ${msg(e)}`] };
  }

  const cap = Math.min(
    cfg.maxListings ?? 200,
    ctx.limit ?? Number.MAX_SAFE_INTEGER
  );
  const raws: Array<Record<string, unknown>> = [];
  for (const url of urls.slice(0, cap)) {
    try {
      const html = await ctx.fetcher.text(url);
      const title = extractTitleTag(html);
      raws.push({
        id: listingKeyFromUrl(url),
        url,
        title,
        // Le titre porte le type ; parseListings/normalizePropertyType s'en charge.
        type: title,
        price: extractPriceEur(title ?? '') ?? extractPriceEur(html),
        surface: extractSurfaceM2(title ?? '') ?? extractSurfaceM2(html),
        rooms: extractRooms(title ?? '') ?? extractRooms(html),
        city: cityFromVenteTitle(title),
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
