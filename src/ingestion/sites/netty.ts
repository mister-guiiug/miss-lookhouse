/**
 * Connecteur de site « Netty / Modelo ». Particularités constatées en live
 * (bsleimmo.com, lesclesdechloe.fr) :
 *  - le `<title>` est inexploitable (vide ou slogan) → on parse le SLUG d'URL,
 *    très riche : `appartement-t2-2-pieces-clermont-ferrand-63000,VA1904` ou
 *    `appartement-t4-chamalieres-vente-fr_VA2325.htm` → type/pièces/ville/CP/réf ;
 *  - le PRIX est le 1er montant € du corps (99 000 € / 146 000 €) ;
 *  - les annonces VENDUES restent dans le sitemap → on filtre sur le statut.
 *
 * Renvoie des objets bruts ; `parseListings` normalise. Réutilise le helper
 * sitemap et les extracteurs prix/surface.
 */
import { extractPriceEur, extractSurfaceM2, inDepartments } from './extract';
import { collectListingUrls } from './sitemap';
import type { SiteCollectContext, SiteCollectResult } from './types';

export interface NettyConfig {
  sitemapUrl: string;
  /** Regex (source) des URLs de vente (avec réf), ex. `/vente/[^,]+,V`. */
  detailUrlPattern: string;
  maxListings?: number;
}

export interface NettySlug {
  type: string | null;
  rooms: number | null;
  city: string | null;
  postalCode: string | null;
  ref: string | null;
}

// Jetons de slug à NE PAS retenir comme ville.
const STOP =
  /^(appartement|appart|appt|maison|villa|pavillon|terrain|immeuble|local|commerce|bureau|parking|garage|box|studio|duplex|loft|propriete|grange|fermette|mas|chalet|longere|[tf]\d+|\d+|pi[èe]ces?|vente|location|achat|louer|acheter|fr|neuf|neuve|ancien|ancienne|plain|pied|a|de|la|le|les|du|des)$/i;

/** Extrait type/pièces/ville/CP/réf depuis le dernier segment d'URL Netty. */
export function parseNettySlug(url: string): NettySlug {
  let last: string;
  try {
    last =
      new URL(url).pathname
        .replace(/\.htm$/i, '')
        .split('/')
        .filter(Boolean)
        .pop() ?? '';
  } catch {
    return { type: null, rooms: null, city: null, postalCode: null, ref: null };
  }
  const ref =
    /[,_]([a-z]{1,3}\d{3,})$/i.exec(last)?.[1] ??
    /\b([a-z]{1,3}\d{3,})\b/i.exec(last)?.[1] ??
    null;
  const slug = last.replace(/[,_][a-z]{1,3}\d{3,}$/i, '');
  const tokens = slug.split(/[-_,]/).filter(Boolean);

  const postalCode = tokens.find(t => /^\d{5}$/.test(t)) ?? null;
  const tN = tokens.find(t => /^[tf]\d+$/i.test(t));
  let rooms = tN ? Number(tN.slice(1)) : null;
  const pIdx = tokens.findIndex(t => /^pi[èe]ces?$/i.test(t));
  if (rooms == null && pIdx > 0) {
    const prev = tokens[pIdx - 1];
    if (prev && /^\d+$/.test(prev)) rooms = Number(prev);
  }
  const type = tokens[0] ?? null;
  const cityTokens = tokens.filter((t, i) => i > 0 && !STOP.test(t));
  const city = cityTokens.length
    ? cityTokens.map(t => t.charAt(0).toUpperCase() + t.slice(1)).join(' ')
    : null;

  return { type, rooms, city, postalCode, ref };
}

/** Vrai si la page indique un bien vendu/retiré (à exclure). */
function isSold(text: string): boolean {
  return (
    /\bvendue?\b/i.test(text) &&
    !/(en vente|disponible|sous (compromis|offre))/i.test(text)
  );
}

export async function collectNetty(
  cfg: NettyConfig,
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
  if (ctx.departments?.length) {
    urls = urls.filter(u => inDepartments(u, ctx.departments));
  }

  const cap = Math.min(
    cfg.maxListings ?? 200,
    ctx.limit ?? Number.MAX_SAFE_INTEGER
  );
  const raws: Array<Record<string, unknown>> = [];
  for (const url of urls.slice(0, cap)) {
    const s = parseNettySlug(url);
    try {
      const html = await ctx.fetcher.text(url);
      const text = html.replace(/<[^>]+>/g, ' ');
      if (isSold(text)) continue; // annonce vendue → ignorée
      const title = [
        s.type ? s.type.charAt(0).toUpperCase() + s.type.slice(1) : null,
        s.rooms ? `${s.rooms} pièces` : null,
        s.city,
      ]
        .filter(Boolean)
        .join(' ');
      raws.push({
        id: s.ref ?? url,
        url,
        title: title || null,
        type: s.type,
        rooms: s.rooms,
        city: s.city,
        postalCode: s.postalCode,
        price: extractPriceEur(html),
        surface: extractSurfaceM2(html),
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
