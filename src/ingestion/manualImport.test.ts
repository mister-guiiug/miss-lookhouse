import { describe, it, expect } from 'vitest';
import { manualImportConnector } from './connectors/manualImport';

const ctx = { config: {}, now: 1_700_000_000_000 };

describe('manualImportConnector', () => {
  it('parse un tableau JSON d’annonces', async () => {
    const payload = JSON.stringify([
      {
        source: 'leboncoin',
        id: '123',
        title: 'T3',
        price: '245 000 €',
        surface: '68 m²',
        rooms: 3,
        type: 'Appartement',
      },
    ]);
    const res = await manualImportConnector.collect({ payload }, ctx);
    expect(res.listings).toHaveLength(1);
    const l = res.listings[0];
    expect(l?.sourceId).toBe('leboncoin');
    expect(l?.price).toBe(245000);
    expect(l?.surfaceM2).toBe(68);
    expect(l?.propertyType).toBe('appartement');
  });

  it('construit une annonce minimale depuis une URL', async () => {
    const res = await manualImportConnector.collect(
      {
        payload: 'https://www.leboncoin.fr/ventes_immobilieres/2895012345.htm',
      },
      ctx
    );
    expect(res.listings).toHaveLength(1);
    expect(res.listings[0]?.sourceId).toBe('leboncoin');
    expect(res.listings[0]?.externalId).toBe('2895012345');
  });

  it('signale un payload illisible', async () => {
    const res = await manualImportConnector.collect(
      { payload: 'n’importe quoi' },
      ctx
    );
    expect(res.listings).toHaveLength(0);
    expect(res.warnings.length).toBeGreaterThan(0);
  });
});
