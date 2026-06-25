import { describe, expect, it } from 'vitest';
import {
  cityPostalFromText,
  deptOf,
  extractPriceEur,
  extractSurfaceM2,
  inDepartments,
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

  it('cityPostalFromText : ville + CP, sans faux positif sur un prix', () => {
    // titre ERA : ville + CP en fin de titre (verbe « acheter » écarté)
    expect(
      cityPostalFromText(
        'Terrain 0 pièces 444 m² à vendre / acheter avensan 33480'
      )
    ).toEqual({ city: 'Avensan', postalCode: '33480' });
    // ville multi-mots conservée
    expect(cityPostalFromText('Maison Clermont Ferrand 63000')).toEqual({
      city: 'Clermont Ferrand',
      postalCode: '63000',
    });
    // un prix « 23 000 € » (5 chiffres mais précédé de chiffres/€) ne piège pas
    expect(cityPostalFromText('Maison 0m² 23000 €')).toEqual({
      city: null,
      postalCode: null,
    });
  });

  it('deptOf / inDepartments (périmètre par département)', () => {
    expect(deptOf('63000')).toBe('63');
    expect(
      deptOf('https://x.fr/annonces/achat/maison/margency-95580/1552306')
    ).toBe('95');
    expect(deptOf('https://x.fr/annonces/168309')).toBeNull(); // 6 chiffres, pas un CP
    // full (pas de filtre)
    expect(inDepartments('75001', undefined)).toBe(true);
    expect(inDepartments('75001', [])).toBe(true);
    // dans / hors périmètre
    expect(inDepartments('.../clermont-ferrand-63000,VA1', ['63', '03'])).toBe(
      true
    );
    expect(inDepartments('75001', ['63', '03'])).toBe(false);
    // pas de CP détecté → ne filtre pas (le post-filtre par CP tranche)
    expect(inDepartments('/annonce/sans-cp/r2052305', ['63'])).toBe(true);
  });
});
