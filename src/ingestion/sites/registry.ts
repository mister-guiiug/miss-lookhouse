/**
 * Aiguillage des connecteurs de site par `kind` (valeur de `source_connectors.config.kind`).
 * Étendre ici quand on ajoute jsonld_sitemap / la_boite_immo / netty / sitemap_network.
 */
import type { SiteCollectContext, SiteCollectResult } from './types';
import {
  collectWordPressRest,
  type WordPressRestConfig,
} from './wordpressRest';
import { collectSitemapHtml, type SitemapHtmlConfig } from './sitemapHtml';

export async function collectSite(
  kind: string,
  cfg: Record<string, unknown>,
  ctx: SiteCollectContext
): Promise<SiteCollectResult> {
  switch (kind) {
    case 'wordpress_rest':
      return collectWordPressRest(cfg as unknown as WordPressRestConfig, ctx);
    case 'sitemap_html':
      return collectSitemapHtml(cfg as unknown as SitemapHtmlConfig, ctx);
    default:
      return {
        raws: [],
        warnings: [`Type de connecteur de site inconnu : « ${kind} ».`],
      };
  }
}
