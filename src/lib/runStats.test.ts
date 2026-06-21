import { describe, it, expect } from 'vitest';
import { aggregateRuns } from './runStats';
import type { IngestionRun } from '../store/types';

const mk = (over: Partial<IngestionRun>): IngestionRun => ({
  id: 'r',
  at: '2026-06-21T10:00:00Z',
  trigger: 'manual',
  status: 'success',
  stats: { added: 0, updated: 0, warnings: 0 },
  events: [],
  ...over,
});

describe('aggregateRuns', () => {
  it('agrège statuts, volumes, taux et dernière exécution', () => {
    const m = aggregateRuns([
      mk({
        at: '2026-06-21T08:00:00Z',
        status: 'success',
        stats: { added: 3, updated: 1, warnings: 0 },
      }),
      mk({
        at: '2026-06-21T09:00:00Z',
        status: 'error',
        stats: { added: 0, updated: 0, warnings: 2 },
      }),
      mk({
        at: '2026-06-21T10:00:00Z',
        status: 'partial',
        stats: { added: 2, updated: 5, warnings: 1 },
      }),
    ]);
    expect(m.total).toBe(3);
    expect(m.success).toBe(1);
    expect(m.error).toBe(1);
    expect(m.partial).toBe(1);
    expect(m.successRate).toBe(33);
    expect(m.totalAdded).toBe(5);
    expect(m.totalUpdated).toBe(6);
    expect(m.totalWarnings).toBe(3);
    expect(m.lastAt).toBe('2026-06-21T10:00:00Z');
  });

  it('liste vide → métriques nulles', () => {
    const m = aggregateRuns([]);
    expect(m.total).toBe(0);
    expect(m.successRate).toBeNull();
    expect(m.lastAt).toBeNull();
  });
});
