import { describe, expect, it } from 'vitest';
import { collectWordPressRest } from './wordpressRest';
import type { SiteFetch } from './types';
import { parseListings } from '../schema';

// Fetch sur fixtures (aucun réseau) : items WP REST avec taxonomies en IDs de
// termes + une page détail portant le prix labellisé.
function fixtureFetch(): SiteFetch {
  const ITEMS = [
    {
      id: 101,
      link: 'https://ex.fr/home-details/coudes/',
      title: { rendered: 'À Coudes, Maison 3 pièces avec terrain' },
      content: { rendered: '<p>Maison de 131 m².</p>' },
      'property-type': [21],
      location: [138],
      'nombres-de-pieces': [63],
      'listing-status': [42],
    },
    {
      id: 102,
      link: 'https://ex.fr/home-details/issoire-vendu/',
      title: { rendered: 'À Issoire, Appartement 2 pièces' },
      content: { rendered: '<p>Vendu.</p>' },
      'property-type': [8],
      location: [60],
      'nombres-de-pieces': [62],
      'listing-status': [136], // Vendu → exclu
    },
  ];
  const TERMS: Record<string, Array<{ id: number; name: string }>> = {
    'property-type': [
      { id: 21, name: 'Maisons' },
      { id: 8, name: 'Appartements' },
    ],
    location: [
      { id: 138, name: 'Coudes - 63114' },
      { id: 60, name: 'Issoire - 63500' },
    ],
    'nombres-de-pieces': [
      { id: 63, name: '3 pièces et +' },
      { id: 62, name: '2 pièces et +' },
    ],
    'listing-status': [
      { id: 42, name: 'A vendre' },
      { id: 136, name: 'Vendu' },
    ],
  };
  const DETAIL: Record<string, string> = {
    'https://ex.fr/home-details/coudes/':
      '<div class="prix">Prix : 219 400 €</div><div>Surface habitable : 131 m²</div>' +
      '<div>Taxe foncière : 1 347 €/an</div>',
  };
  return {
    async json<T>(url: string): Promise<T> {
      if (url.includes('/home-details?')) return ITEMS as unknown as T;
      const tax = /\/wp\/v2\/([^?]+)\?/.exec(url)?.[1] ?? '';
      return (TERMS[tax] ?? []) as unknown as T;
    },
    async text(url: string): Promise<string> {
      return DETAIL[url] ?? '';
    },
  };
}

describe('collectWordPressRest', () => {
  it('résout les taxonomies, exclut les vendus, enrichit prix/surface', async () => {
    const { raws, warnings } = await collectWordPressRest(
      {
        baseUrl: 'https://ex.fr',
        postType: 'home-details',
        taxonomies: {
          propertyType: 'property-type',
          location: 'location',
          rooms: 'nombres-de-pieces',
          status: 'listing-status',
        },
        enrichDetail: true,
      },
      { fetcher: fixtureFetch() }
    );

    expect(warnings).toEqual([]);
    expect(raws).toHaveLength(1); // 102 (Vendu) exclu

    // Vérifie aussi l'intégration avec le schéma ML (parseListings).
    const withSource = raws.map(r => ({ ...r, sourceId: 'laurecavard' }));
    const { listings, errors } = parseListings(withSource);
    expect(errors).toEqual([]);
    const m = listings[0]!;
    expect(m.sourceId).toBe('laurecavard');
    expect(m.externalId).toBe('101');
    expect(m.propertyType).toBe('maison');
    expect(m.city).toBe('Coudes');
    expect(m.postalCode).toBe('63114');
    expect(m.rooms).toBe(3);
    expect(m.price).toBe(219400);
    expect(m.surfaceM2).toBe(131);
    expect(m.url).toBe('https://ex.fr/home-details/coudes/');
  });
});
