import { describe, expect, it } from 'vitest';
import { origine, pourquoi, rapprocher } from './rapprochement';
import type { LocalListing, LocalSimilarity } from '../../store/types';

function annonce(id: string, champs: Partial<LocalListing> = {}): LocalListing {
  return {
    id,
    sourceId: 'import_generique',
    externalId: id,
    currency: 'EUR',
    firstSeenAt: '2026-09-01T10:00:00Z',
    lastSeenAt: '2026-09-01T10:00:00Z',
    lastChangedAt: '2026-09-01T10:00:00Z',
    sourceStatus: 'active',
    priceHistory: [],
    ...champs,
  };
}

const sujet = annonce('L0', {
  title: 'Maison 5 pièces avec jardin',
  description: 'Proche écoles, garage double, sous-sol complet.',
  price: 289000,
  surfaceM2: 110,
  rooms: 5,
  propertyType: 'maison',
  lat: 45.7772,
  lng: 3.087,
});

// Arête de l'ingestion : le même bien, prix baissé.
const doublon = annonce('L1', { ...sujet, id: 'L1', price: 279000 });
// Trouvée par les seuls embeddings : même bien, texte réécrit, pas d'arête.
const reecrite = annonce('L2', {
  ...sujet,
  id: 'L2',
  title: 'Belle familiale, grand terrain',
  description: 'Garage pour deux voitures, cave, écoles à pied.',
});
// Sans rapport : un cosinus au-dessus du plancher ne la rend pas pertinente.
const terrain = annonce('L3', {
  title: 'Terrain agricole',
  description: 'Hors zone constructible.',
  price: 45000,
  surfaceM2: 20000,
  propertyType: 'terrain',
  lat: 44.1,
  lng: 1.2,
});

const byId = new Map(
  [sujet, doublon, reecrite, terrain].map(l => [l.id, l] as const)
);
const aretes: LocalSimilarity[] = [
  { id: 's1', aId: 'L1', bId: 'L0', score: 90, bucket: 'probable_identique' },
];

describe('rapprocher', () => {
  it('réunit l’heuristique et les embeddings, et dit d’où vient chacun', () => {
    const r = rapprocher(
      sujet,
      aretes,
      [
        { listingId: 'L1', cosine: 0.99 },
        { listingId: 'L2', cosine: 0.97 },
      ],
      byId
    );
    const parId = new Map(r.map(x => [x.other.id, x]));
    expect(parId.get('L1')?.viaHeuristique).toBe(true);
    expect(parId.get('L1')?.viaEmbeddings).toBe(true);
    expect(origine(parId.get('L1')!)).toBe('heuristique + embeddings');
    expect(parId.get('L2')?.viaHeuristique).toBe(false);
    expect(origine(parId.get('L2')!)).toBe('trouvée par les embeddings');
    expect(parId.get('L2')?.result.origin).toBe('heuristique+embeddings');
  });

  it('trie du plus proche au moins proche', () => {
    const r = rapprocher(
      sujet,
      aretes,
      [{ listingId: 'L2', cosine: 0.97 }],
      byId
    );
    const scores = r.map(x => x.result.score);
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
  });

  it('écarte un voisin d’embeddings que la comparaison complète juge « différent »', () => {
    const r = rapprocher(sujet, [], [{ listingId: 'L3', cosine: 0.9 }], byId);
    expect(r).toEqual([]);
  });

  it('garde une arête de l’heuristique sans cosinus connu, notée par l’heuristique seule', () => {
    const [seule] = rapprocher(sujet, aretes, [], byId);
    expect(seule?.other.id).toBe('L1');
    expect(seule?.viaEmbeddings).toBe(false);
    expect(seule?.result.origin).toBe('heuristique');
    expect(origine(seule!)).toBe('heuristique seule');
  });

  it('ne montre ni l’annonce elle-même, ni une annonce absente du magasin', () => {
    const r = rapprocher(
      sujet,
      [],
      [
        { listingId: 'L0', cosine: 1 },
        { listingId: 'INCONNUE', cosine: 0.99 },
      ],
      byId
    );
    expect(r).toEqual([]);
  });
});

describe('pourquoi', () => {
  it('montre le facteur d’embedding dès qu’il est entré dans le calcul', () => {
    const [r] = rapprocher(
      sujet,
      aretes,
      [{ listingId: 'L1', cosine: 0.86 }],
      byId
    );
    const raisons = pourquoi(r!.result);
    expect(raisons.some(t => /embeddings/.test(t))).toBe(true);
    expect(raisons.length).toBeLessThanOrEqual(3);
  });

  it('sans embeddings, les deux facteurs qui pèsent le plus', () => {
    const [r] = rapprocher(sujet, aretes, [], byId);
    const raisons = pourquoi(r!.result);
    expect(raisons).toHaveLength(2);
    expect(raisons.some(t => /embeddings/.test(t))).toBe(false);
  });
});
