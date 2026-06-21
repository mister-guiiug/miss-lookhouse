import { describe, it, expect } from 'vitest';
import { parseBanResponse } from './geocoder';

// Réponse type de api-adresse.data.gouv.fr (tronquée).
const sample = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [4.846, 45.748] },
      properties: {
        label: 'Lyon 7e Arrondissement',
        postcode: '69007',
        city: 'Lyon',
        score: 0.87,
      },
    },
  ],
};

describe('parseBanResponse', () => {
  it('extrait lat/lng (inverse l’ordre GeoJSON lng,lat)', () => {
    const r = parseBanResponse(sample);
    expect(r).not.toBeNull();
    expect(r?.lat).toBe(45.748);
    expect(r?.lng).toBe(4.846);
    expect(r?.postcode).toBe('69007');
    expect(r?.city).toBe('Lyon');
  });

  it('renvoie null si aucune feature', () => {
    expect(parseBanResponse({ features: [] })).toBeNull();
    expect(parseBanResponse({})).toBeNull();
  });

  it('renvoie null si coordonnées manquantes/invalides', () => {
    expect(parseBanResponse({ features: [{ geometry: {} }] })).toBeNull();
    expect(
      parseBanResponse({
        features: [{ geometry: { coordinates: ['x', 'y'] } }],
      })
    ).toBeNull();
  });
});
