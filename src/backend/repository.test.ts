import { describe, it, expect } from 'vitest';
import { fetchAllRows } from './repository';

describe('fetchAllRows (pagination PostgREST)', () => {
  it('boucle jusqu’à une page incomplète et agrège TOUT (> plafond 1000)', async () => {
    const total = 2300;
    const calls: Array<[number, number]> = [];
    const page = async (from: number, to: number) => {
      calls.push([from, to]);
      const rows: { i: number }[] = [];
      for (let i = from; i <= to && i < total; i++) rows.push({ i });
      return { data: rows, error: null };
    };
    const all = await fetchAllRows<{ i: number }>(page);
    expect(all.length).toBe(total);
    expect(calls.length).toBe(3); // 1000 + 1000 + 300
    expect(all[2299]?.i).toBe(2299);
  });

  it('une seule requête quand la 1re page est incomplète', async () => {
    let n = 0;
    const page = async () => {
      n++;
      return { data: [{ x: 1 }, { x: 2 }], error: null };
    };
    const all = await fetchAllRows<{ x: number }>(page);
    expect(all.length).toBe(2);
    expect(n).toBe(1);
  });

  it('propage l’erreur PostgREST', async () => {
    await expect(
      fetchAllRows(async () => ({ data: null, error: { message: 'boom' } }))
    ).rejects.toThrow('boom');
  });
});
