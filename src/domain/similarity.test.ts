import { describe, it, expect } from 'vitest';
import { computeSimilarity } from './similarity';
import type { ListingLike } from './types';

const base: ListingLike = {
  title: 'Appartement T3 lumineux centre-ville',
  description: 'Cuisine équipée, balcon, 3e étage avec ascenseur.',
  price: 245000,
  surfaceM2: 68,
  rooms: 3,
  propertyType: 'appartement',
  lat: 45.758,
  lng: 4.835,
  contactName: 'Agence Soleil',
  phashes: ['ffffffffffffffff'],
};

describe('computeSimilarity', () => {
  it('détecte un doublon quasi parfait', () => {
    const recycled: ListingLike = {
      ...base,
      title: 'T3 lumineux en centre ville', // texte reformulé
      description: 'Balcon, cuisine équipée, ascenseur.',
      price: 243000, // légère baisse
      phashes: ['fffffffffffffffe'], // mêmes photos (1 bit de diff)
    };
    const res = computeSimilarity(base, recycled);
    expect(res.score).toBeGreaterThanOrEqual(78);
    expect(['doublon_exact', 'probable_identique']).toContain(res.bucket);
    expect(res.factors.length).toBeGreaterThan(4);
    expect(res.reason).toMatch(/\/100/);
  });

  it('classe deux biens distincts comme « différente »', () => {
    const other: ListingLike = {
      title: 'Terrain agricole 2 hectares',
      description: 'Hors zone constructible',
      price: 45000,
      surfaceM2: 20000,
      rooms: null,
      propertyType: 'terrain',
      lat: 44.1,
      lng: 1.2,
      contactName: 'Particulier',
      phashes: ['0000000000000000'],
    };
    const res = computeSimilarity(base, other);
    expect(res.bucket).toBe('different');
    expect(res.score).toBeLessThan(55);
  });

  it('renormalise sur les facteurs comparables (données manquantes)', () => {
    const a: ListingLike = { title: 'Maison', price: 300000 };
    const b: ListingLike = { title: 'Maison', price: 300000 };
    const res = computeSimilarity(a, b);
    // Seuls texte + prix comparables → score élevé sans pénalité pour le reste.
    expect(res.score).toBeGreaterThan(90);
  });

  it('promeut en doublon_exact sur correspondance visuelle quasi parfaite', () => {
    const a: ListingLike = {
      title: 'A',
      phashes: ['ffffffffffffffff'],
      lat: 45,
      lng: 4,
    };
    const b: ListingLike = {
      title: 'B totalement différent',
      phashes: ['ffffffffffffffff'],
      lat: 45,
      lng: 4,
    };
    const res = computeSimilarity(a, b);
    expect(res.bucket).toBe('doublon_exact');
  });
});
