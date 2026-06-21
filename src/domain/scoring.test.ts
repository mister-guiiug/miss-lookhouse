import { describe, it, expect } from 'vitest';
import {
  relevanceScore,
  freshnessScore,
  detectPriceDrop,
  classifyChange,
  detectRepublication,
} from './scoring';
import type { ListingLike, SearchCriteria } from './types';

const criteria: SearchCriteria = {
  priceMin: 150000,
  priceMax: 250000,
  surfaceMin: 50,
  surfaceMax: 90,
  roomsMin: 3,
  roomsMax: 4,
  propertyTypes: ['appartement'],
  keywordsRequired: ['balcon'],
  keywordsExcluded: ['rez-de-chaussée'],
  centerLat: 45.75,
  centerLng: 4.85,
  radiusKm: 5,
};

describe('relevanceScore', () => {
  it('score élevé pour une annonce conforme', () => {
    const listing: ListingLike = {
      title: 'T3 avec balcon',
      description: 'Lumineux',
      price: 220000,
      surfaceM2: 68,
      rooms: 3,
      propertyType: 'appartement',
      lat: 45.76,
      lng: 4.86,
    };
    const res = relevanceScore(listing, criteria);
    expect(res.excluded).toBe(false);
    expect(res.score).toBeGreaterThan(80);
  });

  it('exclut sur mot-clé exclu', () => {
    const res = relevanceScore(
      {
        title: 'Appartement en rez-de-chaussée',
        description: 'balcon',
        price: 200000,
      },
      criteria
    );
    expect(res.excluded).toBe(true);
    expect(res.score).toBe(0);
  });

  it('exclut hors zone géographique', () => {
    const res = relevanceScore(
      { title: 'T3 balcon', price: 200000, lat: 43.6, lng: 1.44 },
      criteria
    );
    expect(res.excluded).toBe(true);
  });
});

describe('freshnessScore', () => {
  it('vaut ~100 pour un changement à l’instant', () => {
    const now = 1_700_000_000_000;
    expect(freshnessScore(now, now)).toBe(100);
  });
  it('décroît avec le temps', () => {
    const now = 1_700_000_000_000;
    const threeDaysAgo = now - 72 * 3_600_000;
    expect(freshnessScore(threeDaysAgo, now)).toBeLessThan(50);
  });
});

describe('detectPriceDrop', () => {
  it('détecte une baisse significative', () => {
    const d = detectPriceDrop(250000, 235000, 3);
    expect(d.dropped).toBe(true);
    expect(d.deltaPct).toBeCloseTo(-6, 0);
  });
  it('ignore une baisse minime', () => {
    expect(detectPriceDrop(250000, 249000, 3).dropped).toBe(false);
  });
});

describe('classifyChange', () => {
  it('priorise une baisse de prix', () => {
    const c = classifyChange({ price: 250000 }, { price: 235000 });
    expect(c.kind).toBe('price_drop');
  });
  it('repère un changement de statut', () => {
    const c = classifyChange(
      { sourceStatus: 'active' },
      { sourceStatus: 'removed' }
    );
    expect(c.kind).toBe('status_change');
  });
  it('repère un changement de texte via empreinte', () => {
    const c = classifyChange({ fingerprint: 'aaa' }, { fingerprint: 'bbb' });
    expect(c.kind).toBe('text_change');
  });
});

describe('detectRepublication', () => {
  it('confirme un recyclage avec disparition préalable', () => {
    const r = detectRepublication({
      differentExternalId: true,
      otherDisappeared: true,
      similarityScore: 85,
    });
    expect(r.recycled).toBe(true);
    expect(r.confidence).toBeGreaterThanOrEqual(85);
  });
  it('rejette si même identifiant', () => {
    const r = detectRepublication({
      differentExternalId: false,
      otherDisappeared: false,
      similarityScore: 99,
    });
    expect(r.recycled).toBe(false);
  });
});
