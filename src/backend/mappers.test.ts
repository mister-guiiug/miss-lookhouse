import { describe, it, expect } from 'vitest';
import {
  searchFromRow,
  searchToRow,
  listingFromRow,
  statusFromRow,
  notificationFromRow,
  type ListingRow,
  type SearchRow,
} from './mappers';

const searchRow: SearchRow = {
  id: 'uuid-1',
  name: 'T3 Lyon',
  source_ids: ['leboncoin', 'pap'],
  city: 'Lyon',
  postal_code: '69007',
  center_lat: 45.75,
  center_lng: 4.85,
  radius_km: 5,
  price_min: 150000,
  price_max: 280000,
  surface_min: 55,
  surface_max: 95,
  rooms_min: 3,
  rooms_max: 4,
  property_types: ['appartement'],
  keywords_required: ['balcon'],
  keywords_excluded: ['rez-de-chaussée'],
  frequency: 'hourly',
  active: true,
  last_run_at: null,
};

describe('search mapper', () => {
  it('mappe une ligne en LocalSearch', () => {
    const s = searchFromRow(searchRow);
    expect(s.id).toBe('uuid-1');
    expect(s.sourceIds).toEqual(['leboncoin', 'pap']);
    expect(s.priceMin).toBe(150000);
    expect(s.propertyTypes).toEqual(['appartement']);
    expect(s.active).toBe(true);
  });

  it('round-trip Local → row → Local conserve les champs clés', () => {
    const back = searchFromRow({
      ...searchRow,
      ...(searchToRow(searchFromRow(searchRow)) as Partial<SearchRow>),
    });
    expect(back.name).toBe('T3 Lyon');
    expect(back.radiusKm).toBe(5);
    expect(back.keywordsExcluded).toEqual(['rez-de-chaussée']);
  });

  it('tolère les tableaux nuls', () => {
    const s = searchFromRow({
      ...searchRow,
      source_ids: null,
      property_types: null,
    });
    expect(s.sourceIds).toEqual([]);
    expect(s.propertyTypes).toEqual([]);
  });
});

const listingRow: ListingRow = {
  id: 'L-uuid',
  source_id: 'leboncoin',
  external_id: '1001',
  url: 'https://x/1001',
  title: 'T3',
  description: 'desc',
  price: 235000,
  currency: 'EUR',
  surface_m2: 68,
  rooms: 3,
  bedrooms: 2,
  property_type: 'appartement',
  floor: '3',
  dpe: 'D',
  charges: 120,
  agency_fees: null,
  lat: 45.73,
  lng: 4.84,
  postal_code: '69007',
  city: 'Lyon',
  address_approx: null,
  is_pro: true,
  contact_name: 'Agence',
  published_at: '2026-06-12T08:00:00Z',
  source_updated_at: null,
  source_status: 'active',
  fingerprint: 'abc',
  first_seen_at: '2026-06-12T08:00:00Z',
  last_seen_at: '2026-06-21T08:00:00Z',
  last_changed_at: '2026-06-20T08:00:00Z',
  disappeared_at: null,
  search_id: null,
  cluster_id: null,
  relevance_score: 88,
  freshness_score: 70,
};

describe('listing mapper', () => {
  it('mappe + rattache l’historique de prix trié', () => {
    const l = listingFromRow(listingRow, [
      {
        listing_id: 'L-uuid',
        observed_at: '2026-06-20T08:00:00Z',
        price: 235000,
      },
      {
        listing_id: 'L-uuid',
        observed_at: '2026-06-12T08:00:00Z',
        price: 245000,
      },
      { listing_id: 'OTHER', observed_at: '2026-06-01T08:00:00Z', price: 1 },
    ]);
    expect(l.sourceId).toBe('leboncoin');
    expect(l.surfaceM2).toBe(68);
    expect(l.disappeared).toBe(false);
    expect(l.priceHistory.map(p => p.price)).toEqual([245000, 235000]);
  });
  it('disappeared = true si disappeared_at présent', () => {
    const l = listingFromRow({
      ...listingRow,
      disappeared_at: '2026-06-19T00:00:00Z',
    });
    expect(l.disappeared).toBe(true);
  });
});

describe('status & notification mappers', () => {
  it('status', () => {
    const { listingId, entry } = statusFromRow({
      listing_id: 'L1',
      status: 'interessante',
      tags: ['jardin'],
    });
    expect(listingId).toBe('L1');
    expect(entry.status).toBe('interessante');
    expect(entry.tags).toEqual(['jardin']);
  });
  it('notification', () => {
    const n = notificationFromRow({
      id: 'n1',
      type: 'price_drop',
      title: 'Baisse',
      body: null,
      listing_id: 'L1',
      read_at: null,
      created_at: '2026-06-20T08:00:00Z',
    });
    expect(n.type).toBe('price_drop');
    expect(n.body).toBe('');
    expect(n.listingId).toBe('L1');
  });
});
