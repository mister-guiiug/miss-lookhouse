import { describe, expect, it } from 'vitest';
import { computeSimilarity, finalizeSimilarity } from './similarity';
import {
  EMBEDDING_COSINE_FLOOR,
  EMBEDDING_DIMENSIONS,
  EMBEDDING_FACTOR,
  EMBEDDING_WEIGHT,
  blendEmbeddingSimilarity,
  embeddingSimilarityFromCosine,
  isValidEmbedding,
} from './embedding';
import type { ListingLike } from './types';

const maison: ListingLike = {
  title: 'Maison 5 pièces avec jardin',
  description: 'Proche écoles, garage double, sous-sol complet.',
  price: 289000,
  surfaceM2: 110,
  rooms: 5,
  propertyType: 'maison',
  lat: 45.7772,
  lng: 3.087,
  contactName: 'Agence du Puy',
};

// Même bien, texte réécrit : l'heuristique hésite, c'est le cas d'usage.
const reecrite: ListingLike = {
  ...maison,
  title: 'Belle familiale, grand terrain',
  description: 'Garage pour deux voitures, cave, écoles à pied.',
  price: 279000,
};

describe('embeddingSimilarityFromCosine', () => {
  it('ne compte rien au plancher ni en dessous', () => {
    expect(embeddingSimilarityFromCosine(EMBEDDING_COSINE_FLOOR)).toBe(0);
    expect(embeddingSimilarityFromCosine(0.5)).toBe(0);
    expect(embeddingSimilarityFromCosine(-1)).toBe(0);
  });

  it('ramène linéairement ]plancher ; 1] sur ]0 ; 1]', () => {
    expect(embeddingSimilarityFromCosine(1)).toBe(1);
    expect(embeddingSimilarityFromCosine(0.925)).toBeCloseTo(0.5, 10);
  });

  it('borne les arrondis flottants et refuse le non-nombre', () => {
    expect(embeddingSimilarityFromCosine(1.0000001)).toBe(1);
    expect(embeddingSimilarityFromCosine(Number.NaN)).toBe(0);
    expect(embeddingSimilarityFromCosine(Number.POSITIVE_INFINITY)).toBe(0);
  });
});

describe('blendEmbeddingSimilarity', () => {
  it('sans cosinus, rend l’heuristique telle quelle, et le dit', () => {
    const h = computeSimilarity(maison, reecrite);
    const b = blendEmbeddingSimilarity(h, null);
    expect(b.score).toBe(h.score);
    expect(b.bucket).toBe(h.bucket);
    expect(b.origin).toBe('heuristique');
    expect(b.cosine).toBeNull();
    expect(b.factors.some(f => f.factor === EMBEDDING_FACTOR)).toBe(false);
  });

  it('avec un cosinus, ajoute un facteur pesé et explique d’où vient le score', () => {
    const h = computeSimilarity(maison, reecrite);
    const b = blendEmbeddingSimilarity(h, 0.99);
    const f = b.factors.find(x => x.factor === EMBEDDING_FACTOR);
    expect(b.origin).toBe('heuristique+embeddings');
    expect(b.cosine).toBe(0.99);
    expect(f?.weight).toBe(EMBEDDING_WEIGHT);
    expect(f?.detail).toMatch(/embeddings/);
    // Textes réécrits mais très proches pour le modèle : le score monte.
    expect(b.score).toBeGreaterThan(h.score);
  });

  it('est la moyenne pondérée du score heuristique et du facteur (poids documenté)', () => {
    // Deux facteurs comparables seulement : texte (0,3) et prix (0,12).
    const a: ListingLike = { title: 'Studio', price: 100000 };
    const bb: ListingLike = { title: 'Studio', price: 100000 };
    const h = computeSimilarity(a, bb);
    const wHeur = h.factors.reduce((s, x) => s + x.weight, 0);
    const cos = 0.94; // → similarité (0,94 − 0,85) / 0,15 = 0,6
    const expected = Math.round(
      ((wHeur * (h.score / 100) + EMBEDDING_WEIGHT * 0.6) /
        (wHeur + EMBEDDING_WEIGHT)) *
        100
    );
    expect(blendEmbeddingSimilarity(h, cos).score).toBe(expected);
  });

  it('les contributions détaillées somment au score (rien de caché)', () => {
    const b = blendEmbeddingSimilarity(
      computeSimilarity(maison, reecrite),
      0.97
    );
    const sum = b.factors.reduce((s, f) => s + f.contribution, 0);
    expect(Math.abs(sum - b.score)).toBeLessThanOrEqual(1);
  });

  it('au plancher, le facteur compte pour zéro mais reste visible', () => {
    const h = computeSimilarity(maison, reecrite);
    const b = blendEmbeddingSimilarity(h, EMBEDDING_COSINE_FLOOR);
    expect(b.factors.find(f => f.factor === EMBEDDING_FACTOR)?.similarity).toBe(
      0
    );
    expect(b.score).toBeLessThanOrEqual(h.score);
  });

  it('est idempotente : mêler deux fois ne compte pas le signal deux fois', () => {
    const h = computeSimilarity(maison, reecrite);
    const once = blendEmbeddingSimilarity(h, 0.96);
    const twice = blendEmbeddingSimilarity(once, 0.96);
    expect(twice.score).toBe(once.score);
    expect(
      twice.factors.filter(f => f.factor === EMBEDDING_FACTOR)
    ).toHaveLength(1);
  });

  it('garde la règle de promotion par l’image (même règle de classement)', () => {
    const a: ListingLike = {
      title: 'A',
      phashes: ['ffffffffffffffff'],
      lat: 45,
      lng: 4,
    };
    const bb: ListingLike = {
      title: 'B totalement différent',
      phashes: ['ffffffffffffffff'],
      lat: 45,
      lng: 4,
    };
    const b = blendEmbeddingSimilarity(computeSimilarity(a, bb), 0.86);
    expect(b.bucket).toBe('doublon_exact');
  });

  it('un poids nul revient à l’heuristique seule', () => {
    const h = computeSimilarity(maison, reecrite);
    const b = blendEmbeddingSimilarity(h, 0.99, { weight: 0 });
    expect(b.score).toBe(h.score);
    expect(b.origin).toBe('heuristique');
  });
});

describe('finalizeSimilarity', () => {
  it('ne modifie pas les facteurs reçus', () => {
    const h = computeSimilarity(maison, reecrite);
    const frozen = h.factors.map(f => ({ ...f, contribution: -1 }));
    finalizeSimilarity(frozen);
    expect(frozen.every(f => f.contribution === -1)).toBe(true);
  });
});

describe('isValidEmbedding', () => {
  const good = Array.from({ length: EMBEDDING_DIMENSIONS }, (_, i) => i / 1000);

  it('accepte 384 nombres finis', () => {
    expect(isValidEmbedding(good)).toBe(true);
  });

  it('refuse une mauvaise dimension, un non-nombre, un non-tableau', () => {
    expect(isValidEmbedding(good.slice(1))).toBe(false);
    expect(isValidEmbedding([...good.slice(1), Number.NaN])).toBe(false);
    expect(isValidEmbedding([...good.slice(1), '0.1'])).toBe(false);
    expect(isValidEmbedding({ length: EMBEDDING_DIMENSIONS })).toBe(false);
    expect(isValidEmbedding(null)).toBe(false);
  });
});
