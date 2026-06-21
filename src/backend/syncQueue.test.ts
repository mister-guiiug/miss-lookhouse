import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  enqueue,
  drain,
  queueSize,
  deadLetterSize,
  listQueue,
  requeueDeadLetter,
  clearQueue,
  clearDeadLetter,
  MAX_ATTEMPTS,
} from './syncQueue';
import type { SyncIntent } from './syncBus';

const del = (id: string): SyncIntent => ({ kind: 'deleteSearch', id });

beforeEach(() => {
  clearQueue();
  clearDeadLetter();
});

describe('enqueue', () => {
  it('ajoute une intention à la file', () => {
    enqueue(del('a'));
    enqueue(del('b'));
    expect(queueSize()).toBe(2);
  });
});

describe('drain', () => {
  it('vide la file quand tout réussit', async () => {
    enqueue(del('a'));
    enqueue(del('b'));
    const processor = vi.fn().mockResolvedValue(undefined);
    const res = await drain(processor);
    expect(res.done).toBe(2);
    expect(queueSize()).toBe(0);
    expect(processor).toHaveBeenCalledTimes(2);
  });

  it('rejoue (incrémente) sur échec transitoire et préserve l’ordre', async () => {
    enqueue(del('a'));
    enqueue(del('b'));
    const processor = vi.fn().mockRejectedValue(new Error('réseau'));
    const res = await drain(processor);
    expect(res.retried).toBe(1);
    expect(res.done).toBe(0);
    // L'élément reste en tête, attempts incrémenté ; le 2e n'est pas touché.
    expect(queueSize()).toBe(2);
    expect(listQueue()[0]?.attempts).toBe(1);
    expect(processor).toHaveBeenCalledTimes(1); // STOP après le 1er échec
  });

  it('traite les suivants quand le 1er réussit puis bloque sur le 2e', async () => {
    enqueue(del('ok'));
    enqueue(del('boom'));
    enqueue(del('after'));
    const processor = vi.fn((intent: SyncIntent) =>
      intent.kind === 'deleteSearch' && intent.id === 'boom'
        ? Promise.reject(new Error('boom'))
        : Promise.resolve()
    );
    const res = await drain(processor);
    expect(res.done).toBe(1);
    expect(res.retried).toBe(1);
    expect(
      listQueue().map(i =>
        i.intent.kind === 'deleteSearch' ? i.intent.id : ''
      )
    ).toEqual(['boom', 'after']);
  });

  it('envoie en dead-letter après MAX_ATTEMPTS', async () => {
    enqueue(del('a'));
    const processor = vi.fn().mockRejectedValue(new Error('permanent'));
    for (let i = 0; i < MAX_ATTEMPTS; i++) await drain(processor);
    expect(queueSize()).toBe(0);
    expect(deadLetterSize()).toBe(1);
  });
});

describe('requeueDeadLetter', () => {
  it('remet la dead-letter en file avec compteur remis à zéro', async () => {
    enqueue(del('a'));
    const processor = vi.fn().mockRejectedValue(new Error('permanent'));
    for (let i = 0; i < MAX_ATTEMPTS; i++) await drain(processor);
    expect(deadLetterSize()).toBe(1);
    requeueDeadLetter();
    expect(deadLetterSize()).toBe(0);
    expect(queueSize()).toBe(1);
    expect(listQueue()[0]?.attempts).toBe(0);
  });
});
