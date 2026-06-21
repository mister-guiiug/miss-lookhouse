/**
 * File de synchronisation PERSISTANTE (offline-first). Remplace le push
 * fire-and-forget : chaque intention est mise en file (localStorage), puis
 * drainée en série. Un échec transitoire (réseau/RLS temporaire) est rejoué ;
 * au-delà de `MAX_ATTEMPTS`, l'élément part en dead-letter (consultable) plutôt
 * que d'être perdu silencieusement. Inspiré du `syncQueue` de miss-uwh.
 *
 * La logique est PURE (testable) : le `drain` reçoit un `processor` qui pousse
 * réellement vers le dépôt — il n'y a aucun I/O ici hormis localStorage.
 */
import type { SyncIntent } from './syncBus';
import { makeId } from '../store/ids';

export interface QueuedItem {
  id: string;
  intent: SyncIntent;
  attempts: number;
  enqueuedAt: string;
  lastError?: string;
}

export interface DrainResult {
  done: number;
  retried: number;
  dead: number;
}

const KEY = 'miss-lookhouse-syncq-v1';
const DEAD_KEY = 'miss-lookhouse-syncq-dead-v1';
export const MAX_ATTEMPTS = 5;

function load(key: string): QueuedItem[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const arr = JSON.parse(raw) as QueuedItem[];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function save(key: string, items: QueuedItem[]): void {
  try {
    localStorage.setItem(key, JSON.stringify(items));
  } catch {
    /* quota / SSR : silencieux */
  }
}

/** Met une intention en file (à drainer plus tard). */
export function enqueue(intent: SyncIntent): QueuedItem {
  const item: QueuedItem = {
    id: makeId('sq'),
    intent,
    attempts: 0,
    enqueuedAt: new Date().toISOString(),
  };
  const items = load(KEY);
  items.push(item);
  save(KEY, items);
  return item;
}

export function queueSize(): number {
  return load(KEY).length;
}
export function deadLetterSize(): number {
  return load(DEAD_KEY).length;
}
export function listQueue(): QueuedItem[] {
  return load(KEY);
}
export function listDeadLetter(): QueuedItem[] {
  return load(DEAD_KEY);
}
export function clearQueue(): void {
  save(KEY, []);
}
export function clearDeadLetter(): void {
  save(DEAD_KEY, []);
}

/** Rejoue la dead-letter en la remettant en tête de file (action manuelle). */
export function requeueDeadLetter(): void {
  const dead = load(DEAD_KEY).map(d => ({ ...d, attempts: 0 }));
  if (dead.length === 0) return;
  save(KEY, [...dead, ...load(KEY)]);
  save(DEAD_KEY, []);
}

/**
 * Draine la file EN SÉRIE (FIFO, l'ordre est préservé). Pour chaque élément :
 * - succès → retiré de la file ;
 * - échec & attempts < MAX → on incrémente et on STOPPE (rejeu ultérieur, ordre
 *   préservé) ;
 * - échec & attempts ≥ MAX → dead-letter, et on continue avec le suivant.
 */
export async function drain(
  processor: (intent: SyncIntent) => Promise<void>
): Promise<DrainResult> {
  const result: DrainResult = { done: 0, retried: 0, dead: 0 };
  // Borne anti-boucle (les éléments ajoutés en cours de drain restent traités).
  let guard = 1000;
  while (guard-- > 0) {
    const queue = load(KEY);
    const item = queue[0];
    if (!item) break;
    try {
      await processor(item.intent);
      save(KEY, queue.slice(1));
      result.done++;
    } catch (e) {
      const attempts = item.attempts + 1;
      const lastError = e instanceof Error ? e.message : String(e);
      if (attempts >= MAX_ATTEMPTS) {
        // Permanent : dead-letter, puis on continue avec le suivant.
        save(KEY, queue.slice(1));
        save(DEAD_KEY, [...load(DEAD_KEY), { ...item, attempts, lastError }]);
        result.dead++;
        continue;
      }
      // Transitoire : on conserve l'ordre et on réessaiera plus tard.
      queue[0] = { ...item, attempts, lastError };
      save(KEY, queue);
      result.retried++;
      break;
    }
  }
  return result;
}
