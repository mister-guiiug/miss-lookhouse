import { describe, expect, it } from 'vitest';
import { collectSitemapNetwork } from './sitemapNetwork';
import { cityPostalFromUrl, extractMeta } from './extract';
import type { SiteFetch } from './types';
import { parseListings } from '../schema';

describe('helpers réseau', () => {
  it('extractMeta lit og:title quel que soit l’ordre des attributs', () => {
    expect(
      extractMeta('<meta property="og:title" content="Coucou">', 'og:title')
    ).toBe('Coucou');
    expect(
      extractMeta('<meta content="Salut" name="og:title">', 'og:title')
    ).toBe('Salut');
    expect(extractMeta('<html>', 'og:title')).toBeNull();
  });
  it('cityPostalFromUrl extrait ville + CP du slug', () => {
    expect(
      cityPostalFromUrl(
        'https://www.safti.fr/annonces/achat/maison/margency-95580/1552306'
      )
    ).toEqual({
      city: 'Margency',
      postalCode: '95580',
    });
    expect(cityPostalFromUrl('https://x.fr/sans-cp/123')).toEqual({
      city: null,
      postalCode: null,
    });
  });
});

function fixtureFetch(): SiteFetch {
  const SITEMAP = `<urlset>
    <url><loc>https://safti.fr/annonces/achat/maison/margency-95580/1552306</loc></url>
    <url><loc>https://safti.fr/annonces/achat/maison/paris-75011/9001</loc></url>
  </urlset>`;
  const PAGES: Record<string, string> = {
    'https://safti.fr/annonces/achat/maison/margency-95580/1552306':
      '<head><meta property="og:title" content="Vente de maison 7 pièces à Margency 95580 : 193m², prix 750 000 €. Réf. : 1552306 | SAFTI"></head>',
    // page « coquille » : aucune donnée → doit être ignorée
    'https://safti.fr/annonces/achat/maison/paris-75011/9001':
      '<head><meta property="og:title" content="SAFTI - Réseau immobilier"></head>',
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

describe('collectSitemapNetwork', () => {
  it('extrait depuis og:title, ignore les coquilles', async () => {
    const { raws, warnings } = await collectSitemapNetwork(
      {
        sitemapUrl: 'https://safti.fr/sitemap.xml',
        detailUrlPattern: '/annonces/achat/[^/]+/[^/]+/[0-9]+',
      },
      { fetcher: fixtureFetch() }
    );
    expect(warnings.some(w => w.includes('sans données'))).toBe(true);
    expect(raws).toHaveLength(1); // la coquille est exclue

    const { listings, errors } = parseListings(
      raws.map(r => ({ ...r, sourceId: 'safti' }))
    );
    expect(errors).toEqual([]);
    const m = listings[0]!;
    expect(m.externalId).toBe('1552306');
    expect(m.propertyType).toBe('maison');
    expect(m.rooms).toBe(7);
    expect(m.surfaceM2).toBe(193);
    expect(m.price).toBe(750000);
    expect(m.city).toBe('Margency');
    expect(m.postalCode).toBe('95580');
  });
});
