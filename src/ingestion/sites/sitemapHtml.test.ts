import { describe, expect, it } from 'vitest';
import { collectSitemapHtml } from './sitemapHtml';
import type { SiteFetch } from './types';
import { parseListings } from '../schema';

// Sitemap plat + 2 pages détail aux titres denses (formats réels La Boite Immo /
// GTI). /vente/1 est une page index → exclue par le pattern.
function fixtureFetch(): SiteFetch {
  const SITEMAP = `<urlset>
    <url><loc>https://ex.fr/vente/1</loc></url>
    <url><loc>https://ex.fr/vente/893-st-aubin/terrain/9-terrain-pret-a-batir</loc></url>
    <url><loc>https://ex.fr/vente/63-bertignat/maison/1975-maison-familiale</loc></url>
  </urlset>`;
  const PAGES: Record<string, string> = {
    'https://ex.fr/vente/893-st-aubin/terrain/9-terrain-pret-a-batir':
      '<html><head><title>Vente terrain Saint-Aubin-les-Forges 0m² 23000€ | IMMO NOVA</title></head><body>Prix 23 000 € · terrain 1563 m2</body></html>',
    'https://ex.fr/vente/63-bertignat/maison/1975-maison-familiale':
      '<html><head><title>Vente maison Bertignat 4 pièces 140m² 140000€ | GTI</title></head><body>Réf VM6436 · 140 000 €</body></html>',
  };
  return {
    async text(url: string) {
      if (url.endsWith('sitemap.xml')) return SITEMAP;
      return PAGES[url] ?? '';
    },
    async json<T>() {
      return [] as unknown as T;
    },
  };
}

describe('collectSitemapHtml', () => {
  it('énumère le sitemap, exclut les index, extrait depuis le titre', async () => {
    const { raws, warnings } = await collectSitemapHtml(
      {
        sitemapUrl: 'https://ex.fr/sitemap.xml',
        detailUrlPattern: '/vente/[^/]+/[^/]+/[^/]+',
      },
      { fetcher: fixtureFetch() }
    );

    expect(warnings).toEqual([]);
    expect(raws).toHaveLength(2);

    const withSource = raws.map(r => ({ ...r, sourceId: 'gti' }));
    const { listings, errors } = parseListings(withSource);
    expect(errors).toEqual([]);

    const maison = listings.find(l => l.propertyType === 'maison')!;
    expect(maison.city).toBe('Bertignat');
    expect(maison.rooms).toBe(4);
    expect(maison.surfaceM2).toBe(140);
    expect(maison.price).toBe(140000);

    const terrain = listings.find(l => l.propertyType === 'terrain')!;
    expect(terrain.city).toBe('Saint-Aubin-les-Forges');
    expect(terrain.price).toBe(23000);
  });
});
