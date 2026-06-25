import { describe, expect, it } from 'vitest';
import { collectJsonLdSitemap } from './jsonldSitemap';
import type { SiteFetch } from './types';
import { parseListings } from '../schema';

// Cas squarehabitat : le sous-sitemap liste des pages RECHERCHE ; on récolte les
// liens détail /annonces/biens/ dans leur HTML, puis on lit le JSON-LD.
function fixtureFetch(): SiteFetch {
  const SUBSITEMAP = `<urlset>
    <url><loc>https://ex.fr/achat</loc></url>
    <url><loc>https://ex.fr/achat/maison</loc></url>
  </urlset>`;
  const SEARCH = `<html><body>
    <a href="/agence/annonces/biens/achat-ancien/appartement/nantes/uuid-1">A1</a>
    <a href="/agence/annonces/biens/achat-ancien/maison/baye/uuid-2">M2</a>
    <a href="/contact">x</a>
  </body></html>`;
  const detail = (name: string, type: string, price: number, m2: number) =>
    `<html><head><script type="application/ld+json">{"@type":"${type}","name":"${name}","url":"https://ex.fr/u","numberOfRooms":3,"floorSize":{"value":${m2},"unitCode":"MTK"},"address":{"addressLocality":"Nantes 44000"}}</script><script type="application/ld+json">{"@type":"UnitPriceSpecification","price":${price},"priceCurrency":"EUR"}</script></head><body></body></html>`;
  const PAGES: Record<string, string> = {
    'https://ex.fr/sitemap-achat.xml': SUBSITEMAP,
    'https://ex.fr/achat': SEARCH,
    'https://ex.fr/achat/maison': SEARCH,
    'https://ex.fr/agence/annonces/biens/achat-ancien/appartement/nantes/uuid-1':
      detail('Appart Nantes', 'Apartment', 183000, 28.1),
    'https://ex.fr/agence/annonces/biens/achat-ancien/maison/baye/uuid-2':
      detail('Maison Baye', 'House', 250000, 90),
  };
  return {
    async text(url: string) {
      return PAGES[url] ?? '';
    },
    async json<T>() {
      return [] as unknown as T;
    },
  };
}

describe('collectJsonLdSitemap', () => {
  it('récolte les liens détail puis lit le JSON-LD', async () => {
    const { raws, warnings } = await collectJsonLdSitemap(
      {
        sitemapUrl: 'https://ex.fr/sitemap-achat.xml',
        detailUrlPattern: '/annonces/biens/',
        baseUrl: 'https://ex.fr',
      },
      { fetcher: fixtureFetch() }
    );
    expect(warnings).toEqual([]);
    expect(raws).toHaveLength(2); // 2 liens uniques récoltés (dédoublonnés sur 2 pages)

    const { listings, errors } = parseListings(
      raws.map(r => ({ ...r, sourceId: 'squarehabitat' }))
    );
    expect(errors).toEqual([]);
    const appart = listings.find(l => l.propertyType === 'appartement')!;
    expect(appart.price).toBe(183000);
    expect(appart.surfaceM2).toBe(28.1);
    expect(appart.city).toBe('Nantes');
    expect(appart.postalCode).toBe('44000');
    expect(listings.some(l => l.propertyType === 'maison')).toBe(true);
  });
});
