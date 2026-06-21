import { describe, it, expect } from 'vitest';
import { planIngestion } from './pipeline';
import type { ExistingListing } from './pipeline';
import type { CanonicalListing } from '../domain/types';

function canonical(
  partial: Partial<CanonicalListing> & { sourceId: string; externalId: string }
): CanonicalListing {
  return {
    currency: 'EUR',
    title: null,
    description: null,
    price: null,
    surfaceM2: null,
    rooms: null,
    bedrooms: null,
    propertyType: null,
    lat: null,
    lng: null,
    mediaUrls: [],
    phashes: [],
    ...partial,
  };
}

describe('planIngestion', () => {
  it('planifie une insertion + notification pour une nouvelle annonce pertinente', () => {
    const incoming = [
      canonical({
        sourceId: 'leboncoin',
        externalId: '111',
        title: 'T3 balcon',
        price: 200000,
      }),
    ];
    const plan = planIngestion(incoming, [], { minRelevance: 0 });
    expect(plan.upserts).toHaveLength(1);
    expect(plan.upserts[0]?.kind).toBe('insert');
    expect(plan.notifications.some(n => n.type === 'new_listing')).toBe(true);
  });

  it('détecte une baisse de prix sur une annonce connue', () => {
    const existing: ExistingListing[] = [
      {
        id: 'L1',
        sourceId: 'leboncoin',
        externalId: '111',
        price: 250000,
        title: 'T3',
      },
    ];
    const incoming = [
      canonical({
        sourceId: 'leboncoin',
        externalId: '111',
        title: 'T3',
        price: 235000,
      }),
    ];
    const plan = planIngestion(incoming, existing);
    expect(plan.upserts[0]?.kind).toBe('update');
    expect(plan.notifications.some(n => n.type === 'price_drop')).toBe(true);
  });

  it('repère un recyclage : annonce quasi identique sous un autre id, ancienne disparue', () => {
    const existing: ExistingListing[] = [
      {
        id: 'L1',
        sourceId: 'leboncoin',
        externalId: '111',
        title: 'Appartement T3 lumineux centre-ville',
        description: 'Balcon, cuisine équipée',
        price: 245000,
        surfaceM2: 68,
        rooms: 3,
        propertyType: 'appartement',
        lat: 45.758,
        lng: 4.835,
        phashes: ['ffffffffffffffff'],
        disappeared: true,
      },
    ];
    const incoming = [
      canonical({
        sourceId: 'leboncoin',
        externalId: '999', // identifiant différent
        title: 'T3 lumineux centre ville',
        description: 'Cuisine équipée, balcon',
        price: 243000,
        surfaceM2: 68,
        rooms: 3,
        propertyType: 'appartement',
        lat: 45.758,
        lng: 4.835,
        phashes: ['fffffffffffffffe'],
      }),
    ];
    const plan = planIngestion(incoming, existing);
    expect(plan.similarities).toHaveLength(1);
    expect(plan.notifications.some(n => n.type === 'recycled')).toBe(true);
  });

  it('n’émet pas de notification pour une annonce hors zone', () => {
    const incoming = [
      canonical({
        sourceId: 'pap',
        externalId: '1',
        title: 'T2',
        price: 150000,
        lat: 43.6,
        lng: 1.44,
      }),
    ];
    const plan = planIngestion(incoming, [], {
      criteria: { centerLat: 45.75, centerLng: 4.85, radiusKm: 5 },
      minRelevance: 0,
    });
    expect(plan.upserts[0]?.excluded).toBe(true);
    expect(plan.notifications).toHaveLength(0);
  });
});
