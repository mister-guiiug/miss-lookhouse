import { describe, expect, it } from 'vitest';
import { collectNetty, parseNettySlug } from './netty';
import type { SiteFetch } from './types';
import { parseListings } from '../schema';

describe('parseNettySlug', () => {
  it('parse le format bsleimmo (virgule + réf + CP)', () => {
    expect(
      parseNettySlug(
        'https://www.bsleimmo.com/vente/appartement-t2-2-pieces-clermont-ferrand-63000,VA1904'
      )
    ).toEqual({
      type: 'appartement',
      rooms: 2,
      city: 'Clermont Ferrand',
      postalCode: '63000',
      ref: 'VA1904',
    });
  });

  it('parse le format lesclesdechloe (_fr_REF.htm, sans CP)', () => {
    expect(
      parseNettySlug(
        'https://www.lesclesdechloe.fr/immobilier/appartement-t4-chamalieres-vente-fr_VA2325.htm'
      )
    ).toEqual({
      type: 'appartement',
      rooms: 4,
      city: 'Chamalieres',
      postalCode: null,
      ref: 'VA2325',
    });
  });
});

function fixtureFetch(): SiteFetch {
  const SITEMAP = `<urlset>
    <url><loc>https://ex.fr/vente/maison</loc></url>
    <url><loc>https://ex.fr/vente/appartement-t2-2-pieces-clermont-ferrand-63000,VA1904</loc></url>
    <url><loc>https://ex.fr/vente/maison-4-pieces-cournon-63800,VM267</loc></url>
  </urlset>`;
  const PAGES: Record<string, string> = {
    'https://ex.fr/vente/appartement-t2-2-pieces-clermont-ferrand-63000,VA1904':
      '<html><body>En vente · Prix 99 000 € · charges 1143€ · 44 m²</body></html>',
    // celle-ci est VENDUE → doit être exclue
    'https://ex.fr/vente/maison-4-pieces-cournon-63800,VM267':
      '<html><body>Vendu · 250 000 € · 120 m²</body></html>',
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

describe('collectNetty', () => {
  it('parse les slugs, exclut les vendus, lit le prix au corps', async () => {
    const { raws, warnings } = await collectNetty(
      {
        sitemapUrl: 'https://ex.fr/sitemap.xml',
        detailUrlPattern: '/vente/[^,]+,V',
      },
      { fetcher: fixtureFetch() }
    );
    expect(warnings).toEqual([]);
    expect(raws).toHaveLength(1); // VM267 (Vendu) exclu ; /vente/maison (catégorie) hors pattern

    const { listings, errors } = parseListings(
      raws.map(r => ({ ...r, sourceId: 'bsleimmo' }))
    );
    expect(errors).toEqual([]);
    const m = listings[0]!;
    expect(m.externalId).toBe('VA1904');
    expect(m.propertyType).toBe('appartement');
    expect(m.city).toBe('Clermont Ferrand');
    expect(m.postalCode).toBe('63000');
    expect(m.rooms).toBe(2);
    expect(m.price).toBe(99000);
    expect(m.surfaceM2).toBe(44);
  });
});
