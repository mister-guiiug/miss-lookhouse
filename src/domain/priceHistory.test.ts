import { describe, it, expect } from 'vitest';
import { computeDelta, summarizePriceSeries } from './priceHistory';

describe('computeDelta', () => {
  it('calcule la variation de prix en pourcentage', () => {
    const d = computeDelta({ price: 250000 }, { price: 235000 });
    expect(d.changed).toBe(true);
    expect(d.price?.pct).toBeCloseTo(-6, 0);
  });
  it('détecte un changement de texte et de médias', () => {
    const d = computeDelta(
      { title: 'A', mediaCount: 5 },
      { title: 'B', mediaCount: 8 }
    );
    expect(d.titleChanged).toBe(true);
    expect(d.mediaCount).toEqual({ from: 5, to: 8 });
  });
  it('signale l’absence de changement', () => {
    const snap = { price: 100, title: 't', mediaCount: 1 };
    expect(computeDelta(snap, snap).changed).toBe(false);
  });
});

describe('summarizePriceSeries', () => {
  it('synthétise une tendance baissière', () => {
    const s = summarizePriceSeries([
      { observedAt: '2026-01-01T00:00:00Z', price: 260000 },
      { observedAt: '2026-02-01T00:00:00Z', price: 250000 },
      { observedAt: '2026-03-01T00:00:00Z', price: 240000 },
    ]);
    expect(s.first).toBe(260000);
    expect(s.last).toBe(240000);
    expect(s.min).toBe(240000);
    expect(s.max).toBe(260000);
    expect(s.direction).toBe('down');
    expect(s.drops).toBe(2);
    expect(s.changePct).toBeCloseTo(-7.7, 0);
  });
  it('gère une série vide', () => {
    const s = summarizePriceSeries([]);
    expect(s.direction).toBe('flat');
    expect(s.first).toBeNull();
  });
});
