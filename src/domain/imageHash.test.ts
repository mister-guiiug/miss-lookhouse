import { describe, it, expect } from 'vitest';
import { dHashFromGray9x8, hammingHex, imageSimilarity } from './imageHash';

function gradient(): number[] {
  // 9×8 : luminance croissante de gauche à droite → dHash déterministe.
  const out: number[] = [];
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 9; col++) out.push(col * 28);
  }
  return out;
}

describe('dHashFromGray9x8', () => {
  it('produit 16 caractères hex', () => {
    const h = dHashFromGray9x8(gradient());
    expect(h).toHaveLength(16);
    expect(/^[0-9a-f]+$/.test(h)).toBe(true);
  });
  it('rejette une taille incorrecte', () => {
    expect(() => dHashFromGray9x8([1, 2, 3])).toThrow();
  });
});

describe('hammingHex', () => {
  it('vaut 0 pour des hash identiques', () => {
    expect(hammingHex('ffff', 'ffff')).toBe(0);
  });
  it('compte les bits différents', () => {
    expect(hammingHex('0', 'f')).toBe(4);
    expect(hammingHex('00', 'ff')).toBe(8);
  });
});

describe('imageSimilarity', () => {
  it('vaut 1 pour des jeux identiques', () => {
    expect(imageSimilarity(['ffffffffffffffff'], ['ffffffffffffffff'])).toBe(1);
  });
  it('null si un jeu est vide', () => {
    expect(imageSimilarity([], ['abcd'])).toBeNull();
    expect(imageSimilarity(null, null)).toBeNull();
  });
  it('prend la meilleure paire', () => {
    const sim = imageSimilarity(
      ['0000000000000000', 'ffffffffffffffff'],
      ['fffffffffffffffe']
    );
    expect(sim).not.toBeNull();
    expect(sim ?? 0).toBeGreaterThan(0.95);
  });
});
