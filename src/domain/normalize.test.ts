import { describe, it, expect } from 'vitest';
import {
  parseNumberFr,
  normalizePropertyType,
  listingFingerprint,
  stripAccents,
} from './normalize';

describe('parseNumberFr', () => {
  it('parse les montants à la française', () => {
    expect(parseNumberFr('245 000 €')).toBe(245000);
    expect(parseNumberFr('72,5 m²')).toBe(72.5);
    expect(parseNumberFr('1.250.000,50')).toBe(1250000.5);
    expect(parseNumberFr('1,250,000.50')).toBe(1250000.5);
    expect(parseNumberFr(320000)).toBe(320000);
    expect(parseNumberFr(null)).toBeNull();
    expect(parseNumberFr('—')).toBeNull();
  });
});

describe('normalizePropertyType', () => {
  it('canonicalise les libellés hétérogènes', () => {
    expect(normalizePropertyType('Appartement T3')).toBe('appartement');
    expect(normalizePropertyType('Studio meublé')).toBe('appartement');
    expect(normalizePropertyType('Belle villa')).toBe('maison');
    expect(normalizePropertyType('Terrain constructible')).toBe('terrain');
    expect(normalizePropertyType('Box fermé')).toBe('parking');
    expect(normalizePropertyType('Péniche')).toBe('autre');
    expect(normalizePropertyType(null)).toBeNull();
  });
});

describe('listingFingerprint', () => {
  it('est stable et insensible casse/espaces', () => {
    const a = listingFingerprint({
      price: 200000,
      surfaceM2: 50,
      rooms: 3,
      title: 'Bel Appart',
      description: 'Lumineux',
    });
    const b = listingFingerprint({
      price: 200000,
      surfaceM2: 50,
      rooms: 3,
      title: 'bel  appart',
      description: 'lumineux',
    });
    expect(a).toBe(b);
  });
  it('change quand le prix change', () => {
    const a = listingFingerprint({ price: 200000, title: 't' });
    const b = listingFingerprint({ price: 190000, title: 't' });
    expect(a).not.toBe(b);
  });
});

describe('stripAccents', () => {
  it('retire les diacritiques', () => {
    expect(stripAccents('Élégant à Mâcon')).toBe('elegant a macon');
  });
});
