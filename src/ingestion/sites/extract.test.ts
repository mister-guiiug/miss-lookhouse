import { describe, expect, it } from 'vitest';
import {
  extractPriceEur,
  extractSurfaceM2,
  isForSaleStatus,
  splitLocation,
} from './extract';

describe('extracteurs de site', () => {
  it('extractPriceEur privilégie le montant labellisé « prix » sur la taxe', () => {
    const html =
      'Taxe foncière 1 347 € · Prix 219 400 € · estimation 2 030 €/an';
    expect(extractPriceEur(html)).toBe(219400);
    expect(extractPriceEur('aucun prix ici')).toBeNull();
  });

  it('extractPriceEur prend le 1er montant plausible si pas de label (pas max)', () => {
    // Prix d'appel 191 400 € avant un tableau de coûts d'énergie « 2 218000 € ».
    const html = '191400€ * ... énergie 2 218000 € 2 315700 €';
    expect(extractPriceEur(html)).toBe(191400);
  });

  it('extractSurfaceM2 lit la surface (m² et m2)', () => {
    expect(extractSurfaceM2('Surface habitable : 131,80 m²')).toBe(131.8);
    expect(extractSurfaceM2('cuisine 12 m2 puis séjour')).toBe(12);
  });

  it('splitLocation sépare ville et code postal', () => {
    expect(splitLocation('Coudes - 63114')).toEqual({
      city: 'Coudes',
      postalCode: '63114',
    });
    expect(splitLocation(null)).toEqual({ city: null, postalCode: null });
  });

  it('isForSaleStatus exclut « Vendu »', () => {
    expect(isForSaleStatus('A vendre')).toBe(true);
    expect(isForSaleStatus('Sous offre')).toBe(true);
    expect(isForSaleStatus('Vendu')).toBe(false);
  });
});
