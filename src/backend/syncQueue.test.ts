/**
 * La logique de file (drain, rejeu, lettres mortes, plafond) est celle du
 * socle, testée dans dev-pwa-config. Ici, on ne teste que le BRANCHEMENT app :
 * reprise des clés localStorage historiques, migration ponctuelle de l'ancien
 * format (`intent` → `payload` + `key`) — aucune écriture en attente perdue —
 * et clé d'entité pour la fusion.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  clearPersistedQueues,
  createIntentQueue,
  intentKey,
  migrateLegacyItems,
} from './syncQueue';
import type { SyncIntent } from './syncBus';

const QUEUE_KEY = 'miss-lookhouse-syncq-v1';
const DEAD_KEY = 'miss-lookhouse-syncq-dead-v1';

const del = (id: string): SyncIntent => ({ kind: 'deleteSearch', id });
const status = (
  listingId: string,
  s: 'interessante' | 'visitee'
): SyncIntent => ({
  kind: 'upsertStatus',
  listingId,
  entry: { status: s, tags: [] },
});

beforeEach(() => {
  localStorage.removeItem(QUEUE_KEY);
  localStorage.removeItem(DEAD_KEY);
});

describe('intentKey', () => {
  it('distingue les kinds pour une même entité (upsert ≠ delete)', () => {
    const upsert: SyncIntent = {
      kind: 'upsertSearch',
      search: { id: 's1' } as never,
    };
    expect(intentKey(upsert)).not.toBe(intentKey(del('s1')));
  });

  it('donne la même clé à deux écritures de la même entité', () => {
    expect(intentKey(status('l1', 'interessante'))).toBe(
      intentKey(status('l1', 'visitee'))
    );
  });
});

describe('migration de l’ancien format (copie locale)', () => {
  const legacy = {
    id: 'sq_1',
    intent: del('a'),
    attempts: 2,
    enqueuedAt: '2026-08-01T00:00:00Z',
    lastError: 'réseau',
  };

  it('reprend les éléments en attente sous les MÊMES clés localStorage', async () => {
    localStorage.setItem(QUEUE_KEY, JSON.stringify([legacy]));
    const processor = vi.fn().mockResolvedValue(undefined);
    const queue = createIntentQueue({ process: processor });

    // Le champ `intent` est devenu `payload`, la clé d'entité est calculée,
    // compteurs et horodatage sont conservés.
    const [entry] = queue.list();
    expect(entry).toMatchObject({
      id: 'sq_1',
      payload: del('a'),
      key: intentKey(del('a')),
      attempts: 2,
      enqueuedAt: '2026-08-01T00:00:00Z',
      lastError: 'réseau',
    });

    // Et surtout : l'écriture en attente part réellement au drain.
    const res = await queue.flush();
    expect(res.done).toBe(1);
    expect(processor).toHaveBeenCalledWith(del('a'), expect.anything());
    expect(queue.pending()).toBe(0);
  });

  it('migre aussi les lettres mortes (rejouables ensuite)', () => {
    localStorage.setItem(DEAD_KEY, JSON.stringify([legacy]));
    const queue = createIntentQueue({ process: vi.fn() });
    expect(queue.deadLetters()).toHaveLength(1);
    expect(queue.requeueDead()).toBe(1);
    expect(queue.pending()).toBe(1);
    expect(queue.list()[0]?.payload).toEqual(del('a'));
  });

  it('est idempotente et laisse le nouveau format intact', () => {
    localStorage.setItem(QUEUE_KEY, JSON.stringify([legacy]));
    migrateLegacyItems('syncq-v1');
    const once = localStorage.getItem(QUEUE_KEY);
    migrateLegacyItems('syncq-v1');
    expect(localStorage.getItem(QUEUE_KEY)).toBe(once);
  });
});

describe('fusion par entité (keyOf)', () => {
  it('ne garde que la dernière écriture en attente d’une même entité', () => {
    const queue = createIntentQueue({
      process: () => Promise.reject(new Error('hors ligne')),
    });
    queue.enqueue(status('l1', 'interessante'));
    queue.enqueue(status('l1', 'visitee'));
    queue.enqueue(status('l2', 'interessante'));
    expect(queue.pending()).toBe(2);
    const first = queue.list()[0]?.payload;
    expect(first?.kind === 'upsertStatus' && first.entry.status).toBe(
      'visitee'
    );
  });
});

describe('clearPersistedQueues', () => {
  it('purge file et lettres mortes sans instance (déconnexion RGPD)', () => {
    localStorage.setItem(QUEUE_KEY, JSON.stringify([legacyLike()]));
    localStorage.setItem(DEAD_KEY, JSON.stringify([legacyLike()]));
    clearPersistedQueues();
    expect(localStorage.getItem(QUEUE_KEY)).toBe('[]');
    expect(localStorage.getItem(DEAD_KEY)).toBe('[]');
  });
});

function legacyLike() {
  return { id: 'sq_x', intent: del('x'), attempts: 0, enqueuedAt: 'now' };
}
