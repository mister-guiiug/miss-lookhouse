import { describe, it, expect } from 'vitest';
import { getByPath, applyFieldMap, pickItems } from './fieldMap';

describe('getByPath', () => {
  it('descend objets et index de tableau', () => {
    const o = { a: { b: [{ c: 42 }] } };
    expect(getByPath(o, 'a.b.0.c')).toBe(42);
    expect(getByPath(o, 'a.b')).toEqual([{ c: 42 }]);
    expect(getByPath(o, '')).toBe(o);
  });

  it('renvoie undefined pour un chemin absent ou traversant un scalaire', () => {
    expect(getByPath({ a: 1 }, 'a.b.c')).toBeUndefined();
    expect(getByPath({ a: 1 }, 'x')).toBeUndefined();
    expect(getByPath(null, 'a')).toBeUndefined();
  });
});

describe('applyFieldMap', () => {
  it('remappe les champs selon les chemins fournis', () => {
    const item = { ref: 'AB12', annonce: { libelle: 'T3', prix: 245000 } };
    const out = applyFieldMap(item, {
      externalId: 'ref',
      title: 'annonce.libelle',
      price: 'annonce.prix',
    });
    expect(out).toEqual({ externalId: 'AB12', title: 'T3', price: 245000 });
  });

  it('ignore les chemins introuvables (pas de clé undefined)', () => {
    const out = applyFieldMap(
      { ref: 'X' },
      { externalId: 'ref', title: 'nope' }
    );
    expect(out).toEqual({ externalId: 'X' });
    expect('title' in out).toBe(false);
  });

  it('sans mappage, renvoie l’objet tel quel', () => {
    const item = { sourceId: 's', externalId: '1' };
    expect(applyFieldMap(item)).toBe(item);
    expect(applyFieldMap('scalaire')).toEqual({});
  });
});

describe('pickItems', () => {
  it('prend la racine si tableau', () => {
    expect(pickItems([1, 2, 3])).toEqual([1, 2, 3]);
  });
  it('suit listPath vers le tableau', () => {
    expect(pickItems({ data: { items: [{ x: 1 }] } }, 'data.items')).toEqual([
      { x: 1 },
    ]);
  });
  it('enveloppe un objet seul et tolère le vide', () => {
    expect(pickItems({ x: 1 })).toEqual([{ x: 1 }]);
    expect(pickItems(null)).toEqual([]);
    expect(pickItems({ data: null }, 'data')).toEqual([]);
  });
});
