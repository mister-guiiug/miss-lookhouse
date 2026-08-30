/**
 * File de synchronisation PERSISTANTE (offline-first) — désormais fournie par
 * le socle (`dev-wpa-config/sync-queue`). Ce module ne garde que le branchement
 * app : mêmes clés localStorage que la copie locale historique, clé d'entité
 * (`intentKey`) pour la fusion, et migration ponctuelle du format. L'adoption
 * REND à la file ce que la copie (« Inspiré du syncQueue de miss-uwh ») avait
 * perdu : le rejeu automatique en retrait exponentiel dispersé — sans attendre
 * un évènement `online` qui ne vient jamais quand c'est le serveur qui tousse.
 */
import {
  createSyncQueue,
  type SyncQueue,
  type SyncQueueEntry,
  type SyncQueueOptions,
} from '@mister-guiiug/dev-wpa-config/sync-queue';
import { createStore } from '@mister-guiiug/dev-wpa-config/storage';
import type { SyncIntent } from './syncBus';

/**
 * `préfixe + clé` reproduit à l'octet près les clés historiques
 * `miss-lookhouse-syncq-v1` / `miss-lookhouse-syncq-dead-v1` (même
 * sérialisation : tableau JSON) — la file d'une session antérieure est reprise.
 */
const store = createStore('miss-lookhouse-');
const QUEUE_KEY = 'syncq-v1';
const DEAD_KEY = 'syncq-dead-v1';

export type IntentQueue = SyncQueue<SyncIntent>;
export type IntentEntry = SyncQueueEntry<SyncIntent>;

/**
 * Clé d'entité pour la fusion : toutes les écritures sont idempotentes par id
 * (upsert, ou insert d'UUID générés côté client), la dernière version en
 * attente d'une même entité suffit donc. Deux intentions de `kind` différent
 * sur la même entité (ex. upsert puis delete d'une recherche) ne fusionnent
 * pas : l'ordre FIFO est préservé.
 */
export function intentKey(intent: SyncIntent): string {
  switch (intent.kind) {
    case 'upsertSearch':
      return `upsertSearch:${intent.search.id}`;
    case 'deleteSearch':
      return `deleteSearch:${intent.id}`;
    case 'upsertStatus':
      return `upsertStatus:${intent.listingId}`;
    case 'addNote':
      return `addNote:${intent.note.id}`;
    case 'setNotificationRead':
      return `setNotificationRead:${intent.id}`;
    case 'addVerification':
      return `addVerification:${intent.verification.id}`;
  }
}

/** Forme écrite par l'ancienne copie locale (payload sous `intent`). */
interface LegacyItem {
  id: string;
  intent: SyncIntent;
  attempts?: number;
  enqueuedAt?: string;
  lastError?: string;
}

function isLegacy(entry: unknown): entry is LegacyItem {
  return (
    entry !== null &&
    typeof entry === 'object' &&
    typeof (entry as LegacyItem).id === 'string' &&
    'intent' in entry &&
    !('payload' in entry)
  );
}

/**
 * Migration PONCTUELLE du format : l'ancienne copie écrivait
 * `{ id, intent, … }`, le socle attend `{ id, payload, key, … }`. Clés
 * localStorage et sérialisation identiques : seuls les champs sont renommés
 * (et la clé d'entité calculée) — aucune écriture en attente n'est perdue.
 * Idempotente : sans entrée à l'ancien format, elle ne réécrit rien.
 */
export function migrateLegacyItems(storageKey: string): void {
  const items = store.get<unknown[]>(storageKey, []);
  if (!Array.isArray(items) || !items.some(isLegacy)) return;
  store.set(
    storageKey,
    items.map(entry =>
      isLegacy(entry)
        ? ({
            id: entry.id,
            payload: entry.intent,
            key: intentKey(entry.intent),
            attempts: entry.attempts ?? 0,
            enqueuedAt: entry.enqueuedAt ?? new Date().toISOString(),
            ...(entry.lastError !== undefined
              ? { lastError: entry.lastError }
              : {}),
          } satisfies IntentEntry)
        : entry
    )
  );
}

/**
 * La file d'intentions de l'app, sur la persistance historique. Le transport
 * (`process`) est injecté par l'appelant (il détient client + userId) ; le
 * reste — drain sérialisé, rejeu en retrait exponentiel, lettres mortes
 * rejouables, fusion par entité, plafond — vient du socle.
 */
export function createIntentQueue(
  options: Pick<SyncQueueOptions<SyncIntent>, 'process' | 'onChange' | 'onDead'>
): IntentQueue {
  migrateLegacyItems(QUEUE_KEY);
  migrateLegacyItems(DEAD_KEY);
  return createSyncQueue<SyncIntent>({
    store,
    queueKey: QUEUE_KEY,
    deadKey: DEAD_KEY,
    keyOf: intentKey,
    ...options,
  });
}

/**
 * Purge totale — file ET lettres mortes — sans exiger d'instance : le chemin
 * de déconnexion (appareil partagé / RGPD) ne doit pas dépendre du fait que la
 * file ait été construite pendant la session.
 */
export function clearPersistedQueues(): void {
  store.set(QUEUE_KEY, []);
  store.set(DEAD_KEY, []);
}
