import { describe, it, expect } from 'vitest';
import {
  tokenize,
  jaccard,
  diceTrigrams,
  textSimilarity,
  containsKeyword,
} from './text';

describe('tokenize', () => {
  it('retire stopwords et accents', () => {
    expect(tokenize('Un bel appartement à Lyon')).toEqual([
      'bel',
      'appartement',
      'lyon',
    ]);
  });
});

describe('jaccard', () => {
  it('vaut 1 pour des ensembles identiques', () => {
    expect(jaccard(['a', 'b'], ['b', 'a'])).toBe(1);
  });
  it('vaut 0 pour des ensembles disjoints', () => {
    expect(jaccard(['a'], ['b'])).toBe(0);
  });
});

describe('textSimilarity', () => {
  it('est élevée pour des textes proches', () => {
    const s = textSimilarity(
      'Appartement T3 lumineux centre-ville',
      'Cuisine équipée, balcon',
      'Appartement T3 lumineux en centre ville',
      'Cuisine équipée et balcon'
    );
    expect(s).toBeGreaterThan(0.7);
  });
  it('est faible pour des textes différents', () => {
    const s = textSimilarity(
      'Studio à louer',
      null,
      'Terrain agricole 2 ha',
      null
    );
    expect(s).toBeLessThan(0.3);
  });
  it('vaut 0 si un seul côté est vide', () => {
    expect(textSimilarity('texte', null, null, null)).toBe(0);
  });
});

describe('diceTrigrams + containsKeyword', () => {
  it('dice élevé pour variations orthographiques', () => {
    expect(diceTrigrams('balcon', 'balcons')).toBeGreaterThan(0.6);
  });
  it('containsKeyword ignore accents/casse', () => {
    expect(containsKeyword('Proche Métro et commerces', 'metro')).toBe(true);
    expect(containsKeyword('Sans balcon', 'terrasse')).toBe(false);
  });
});
