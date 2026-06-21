import { describe, it, expect } from 'vitest';
import {
  haversineMeters,
  withinRadius,
  pointInPolygon,
  geoSimilarity,
} from './geo';

describe('haversineMeters', () => {
  it('mesure ~660 km (orthodromie) entre Paris et Marseille', () => {
    const paris = { lat: 48.8566, lng: 2.3522 };
    const marseille = { lat: 43.2965, lng: 5.3698 };
    const d = haversineMeters(paris, marseille) / 1000;
    expect(d).toBeGreaterThan(650);
    expect(d).toBeLessThan(720);
  });
  it('vaut 0 pour un point sur lui-même', () => {
    const p = { lat: 45, lng: 4 };
    expect(haversineMeters(p, p)).toBe(0);
  });
});

describe('withinRadius', () => {
  it('détecte un point proche', () => {
    const center = { lat: 45.75, lng: 4.85 };
    const near = { lat: 45.76, lng: 4.86 };
    expect(withinRadius(center, near, 5)).toBe(true);
    expect(withinRadius(center, { lat: 46.5, lng: 5.5 }, 5)).toBe(false);
  });
});

describe('pointInPolygon', () => {
  const square: Array<[number, number]> = [
    [0, 0],
    [0, 10],
    [10, 10],
    [10, 0],
  ];
  it('point intérieur', () => {
    expect(pointInPolygon({ lat: 5, lng: 5 }, square)).toBe(true);
  });
  it('point extérieur', () => {
    expect(pointInPolygon({ lat: 20, lng: 20 }, square)).toBe(false);
  });
});

describe('geoSimilarity', () => {
  it('décroît avec la distance', () => {
    const a = { lat: 45.75, lng: 4.85 };
    expect(geoSimilarity(a, a)).toBe(1);
    expect(geoSimilarity(a, { lat: 45.77, lng: 4.87 }, 2000)).toBeLessThan(1);
  });
});
