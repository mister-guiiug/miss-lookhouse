/**
 * Connecteur de site « WordPress REST » (+ taxonomies + enrichissement détail).
 *
 * Constat live (laurecavardimmobilier.fr) : le CPT des annonces n'expose PAS le
 * prix exact via REST. Les champs structurés utiles sont des TAXONOMIES (IDs de
 * termes) : property-type → « Maisons », location → « Coudes - 63114 »,
 * listing-status → « A vendre », nombres-de-pieces → « 3 pièces et + ».
 * Prix/surface exacts uniquement sur la page détail → enrichissement HTML ciblé.
 *
 * Patron général : DÉCOUVERTE structurée (API) + EXTRACTION ciblée (HTML).
 * Le connecteur renvoie des objets BRUTS ; `parseListings` les normalise.
 */
import { parseNumberFr } from '../../domain/normalize';
import {
  cityFromTitle,
  extractPriceEur,
  extractSurfaceM2,
  isForSaleStatus,
  splitLocation,
} from './extract';
import type { SiteCollectContext, SiteCollectResult } from './types';

export interface WordPressRestConfig {
  baseUrl: string;
  postType: string;
  taxonomies?: {
    propertyType?: string;
    location?: string;
    rooms?: string;
    status?: string;
  };
  enrichDetail?: boolean;
  /** Plafond d'annonces (sécurité temps Edge). */
  maxListings?: number;
}

interface WpTerm {
  id: number;
  name: string;
}

interface WpItem {
  id: number | string;
  link?: string;
  title?: { rendered?: string };
  content?: { rendered?: string };
  [taxonomyOrField: string]: unknown;
}

export async function collectWordPressRest(
  cfg: WordPressRestConfig,
  ctx: SiteCollectContext
): Promise<SiteCollectResult> {
  const warnings: string[] = [];
  const base = cfg.baseUrl.replace(/\/$/, '');
  const cap = Math.min(
    cfg.maxListings ?? 200,
    ctx.limit ?? Number.MAX_SAFE_INTEGER
  );

  // 1) Liste des annonces (pagination par longueur de page).
  const items: WpItem[] = [];
  for (let page = 1; items.length < cap; page++) {
    const url = `${base}/wp-json/wp/v2/${cfg.postType}?per_page=100&page=${page}`;
    let batch: WpItem[];
    try {
      batch = await ctx.fetcher.json<WpItem[]>(url);
    } catch (e) {
      warnings.push(
        `WP REST page ${page} : ${e instanceof Error ? e.message : String(e)}`
      );
      break;
    }
    if (!Array.isArray(batch) || batch.length === 0) break;
    items.push(...batch);
    if (batch.length < 100) break;
  }
  const slice = items.slice(0, cap);

  // 2) Résolution des taxonomies déclarées (mise en cache locale).
  const tax = cfg.taxonomies ?? {};
  const termMaps: Record<string, Map<number, string>> = {};
  for (const taxonomy of new Set(Object.values(tax))) {
    if (!taxonomy) continue;
    try {
      const terms = await ctx.fetcher.json<WpTerm[]>(
        `${base}/wp-json/wp/v2/${taxonomy}?per_page=100&_fields=id,name`
      );
      termMaps[taxonomy] = new Map((terms ?? []).map(t => [t.id, t.name]));
    } catch (e) {
      warnings.push(
        `taxonomie ${taxonomy} : ${e instanceof Error ? e.message : String(e)}`
      );
      termMaps[taxonomy] = new Map();
    }
  }

  // 3) Mappage + filtre vente + enrichissement prix/surface.
  const raws: Array<Record<string, unknown>> = [];
  for (const item of slice) {
    const title = item.title?.rendered ?? null;
    const statusName = firstTermName(item, tax.status, termMaps);
    if (statusName && !isForSaleStatus(statusName)) continue; // exclut « Vendu »

    const typeName = firstTermName(item, tax.propertyType, termMaps);
    const locName = firstTermName(item, tax.location, termMaps);
    const roomsName = firstTermName(item, tax.rooms, termMaps);
    const { city, postalCode } = splitLocation(locName);
    const roomsFromTitle = /(\d+)\s*pi[èe]ce/i.exec(title ?? '')?.[1] ?? null;

    const raw: Record<string, unknown> = {
      id: String(item.id),
      url: item.link ?? null,
      title,
      description: item.content?.rendered ?? null,
      type: typeName ?? title,
      city: city ?? cityFromTitle(title),
      postalCode,
      rooms: parseNumberFr(roomsName) ?? parseNumberFr(roomsFromTitle),
    };

    if (cfg.enrichDetail && item.link) {
      try {
        const html = await ctx.fetcher.text(item.link);
        const price = extractPriceEur(html);
        const surface = extractSurfaceM2(html);
        if (price != null) raw.price = price;
        if (surface != null) raw.surface = surface;
      } catch (e) {
        warnings.push(
          `détail ${item.link} : ${e instanceof Error ? e.message : String(e)}`
        );
      }
    }
    raws.push(raw);
  }

  return { raws, warnings };
}

function firstTermName(
  item: WpItem,
  taxonomy: string | undefined,
  maps: Record<string, Map<number, string>>
): string | null {
  if (!taxonomy) return null;
  const ids = item[taxonomy];
  if (!Array.isArray(ids)) return null;
  const map = maps[taxonomy];
  for (const id of ids) {
    const name = map?.get(Number(id));
    if (name) return name;
  }
  return null;
}
