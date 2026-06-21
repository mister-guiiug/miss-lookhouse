import { describe, it, expect } from 'vitest';
import { toDvfType, marketDelta } from './dvf';

describe('toDvfType', () => {
  it('mappe appartement / maison, sinon null', () => {
    expect(toDvfType('appartement')).toBe('Appartement');
    expect(toDvfType('Maison')).toBe('Maison');
    expect(toDvfType('terrain')).toBeNull();
    expect(toDvfType('parking')).toBeNull();
    expect(toDvfType(null)).toBeNull();
    expect(toDvfType(undefined)).toBeNull();
  });
});

describe('marketDelta', () => {
  it('calcule l’écart en % vs la médiane', () => {
    expect(marketDelta(11000, 10000)).toEqual({ pct: 10, over: true });
    expect(marketDelta(9000, 10000)).toEqual({ pct: -10, over: false });
    expect(marketDelta(10000, 10000)).toEqual({ pct: 0, over: false });
  });
  it('renvoie null si une valeur manque', () => {
    expect(marketDelta(null, 10000)).toBeNull();
    expect(marketDelta(11000, null)).toBeNull();
    expect(marketDelta(0, 10000)).toBeNull();
  });
});
