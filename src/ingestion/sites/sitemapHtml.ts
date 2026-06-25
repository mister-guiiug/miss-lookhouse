/**
 * Connecteur générique « sitemap plat → pages HTML » pour les CMS sans données
 * structurées (La Boite Immo, Netty…). Énumère les pages détail via le sitemap
 * (ou récolte les liens sur des pages catégorie si `crawlSeedPattern`), puis
 * extrait les champs depuis le `<title>` (souvent dense, ex. « Vente maison
 * Bertignat 4 pièces 140m² 140000€ ») avec repli sur le corps HTML.
 *
 * Paramétré par `config` → réutilisable pour plusieurs agences sans nouveau code.
 */
import {
  cityFromVenteTitle,
  cityPostalFromText,
  cityPostalFromUrl,
  extractPriceEur,
  extractRooms,
  extractSurfaceM2,
  extractTitleTag,
  listingKeyFromUrl,
} from './extract';
import { resolveDetailUrls } from './sitemap';
import type { SiteCollectContext, SiteCollectResult } from './types';

export interface SitemapHtmlConfig {
  sitemapUrl: string;
  /** Regex (source) identifiant les URLs de pages DÉTAIL (vs index/catégories). */
  detailUrlPattern: string;
  /** Si le sitemap liste des pages catégorie : regex des pages à crawler. */
  crawlSeedPattern?: string;
  /** Base pour résoudre les hrefs relatifs récoltés. */
  baseUrl?: string;
  /** Plafond de pages intermédiaires à crawler. */
  maxPages?: number;
  /** Exclure les annonces de LOCATION (sitemaps mêlant vente+location, ex. okey). */
  saleOnly?: boolean;
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

  const cap = Math.min(
    cfg.maxListings ?? 200,
    ctx.limit ?? Number.MAX_SAFE_INTEGER
  );

  let urls: string[];
  try {
    urls = await resolveDetailUrls(ctx.fetcher, cfg.sitemapUrl, pattern, {
      base: cfg.baseUrl,
      maxPages: cfg.maxPages,
      cap: cap * 3,
      departments: ctx.departments,
      seedPattern: cfg.crawlSeedPattern
        ? new RegExp(cfg.crawlSeedPattern)
        : undefined,
    });
  } catch (e) {
    return { raws: [], warnings: [`sitemap ${cfg.sitemapUrl} : ${msg(e)}`] };
  }

  const raws: Array<Record<string, unknown>> = [];
  for (const url of urls.slice(0, cap)) {
    try {
      const html = await ctx.fetcher.text(url);
      if (cfg.saleOnly && isRental(html)) continue; // exclut les locations
      const title = extractTitleTag(html);
      const fromText = cityPostalFromText(title);
      const fromUrl = cityPostalFromUrl(url);
      raws.push({
        id: listingKeyFromUrl(url),
        url,
        title,
        // Le titre porte le type ; parseListings/normalizePropertyType s'en charge.
        type: title,
        price: extractPriceEur(title ?? '') ?? extractPriceEur(html),
        surface: extractSurfaceM2(title ?? '') ?? extractSurfaceM2(html),
        rooms: extractRooms(title ?? '') ?? extractRooms(html),
        city: cityFromVenteTitle(title) ?? fromText.city ?? fromUrl.city,
        postalCode: fromText.postalCode ?? fromUrl.postalCode,
      });
    } catch (e) {
      warnings.push(`détail ${url} : ${msg(e)}`);
    }
  }

  return { raws, warnings };
}

/**
 * Détecte une page de LOCATION : « loyer », « mensuel » ou un montant suivi de
 * « €/mois ». `\s` couvre déjà les espaces insécables (pas de caractère littéral).
 */
function isRental(html: string): boolean {
  const t = html.replace(/<[^>]+>/g, ' ');
  return /(\bloyer\b|\bmensuel\b|\d[\d\s]*€\s*(?:cc|hc|charges comprises)?\s*\/\s*mois)/i.test(
    t
  );
}

function msg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
