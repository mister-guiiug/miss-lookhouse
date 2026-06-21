import { describe, it, expect } from 'vitest';
import { buildClusters } from './clustering';
import type { SimilarityEdge } from './clustering';

describe('buildClusters', () => {
  it('regroupe les composantes connexes au-dessus du seuil', () => {
    const edges: SimilarityEdge[] = [
      { a: 'L1', b: 'L2', score: 95, bucket: 'doublon_exact' },
      { a: 'L2', b: 'L3', score: 82, bucket: 'probable_identique' },
      { a: 'L4', b: 'L5', score: 80, bucket: 'probable_identique' },
      { a: 'L6', b: 'L7', score: 60, bucket: 'similaire' }, // sous le seuil → ignoré
    ];
    const clusters = buildClusters(edges, 78);
    expect(clusters).toHaveLength(2);
    const big = clusters.find(c => c.members.includes('L1'));
    expect(big?.members).toEqual(['L1', 'L2', 'L3']);
    expect(big?.kind).toBe('doublon_exact');
    expect(big?.maxScore).toBe(95);
  });

  it('ne renvoie pas de cluster singleton', () => {
    const clusters = buildClusters(
      [{ a: 'X', b: 'X', score: 99, bucket: 'doublon_exact' }],
      78
    );
    expect(clusters).toHaveLength(0);
  });
});
