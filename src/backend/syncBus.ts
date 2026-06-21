/**
 * Bus d'intentions de synchronisation (découple le store du dépôt). Le store
 * émet une intention à chaque mutation utilisateur ; en mode Supabase,
 * `SupabaseSync` s'abonne et pousse vers le serveur. En mode local, personne
 * n'est abonné → `emitSync` est un no-op inoffensif.
 */
import type {
  ListingNote,
  ListingStatusEntry,
  LocalSearch,
  LocalVerification,
} from '../store/types';

export type SyncIntent =
  | { kind: 'upsertSearch'; search: LocalSearch }
  | { kind: 'deleteSearch'; id: string }
  | { kind: 'upsertStatus'; listingId: string; entry: ListingStatusEntry }
  | { kind: 'addNote'; listingId: string; note: ListingNote }
  | { kind: 'setNotificationRead'; id: string; readAt: string | null }
  | {
      kind: 'addVerification';
      listingId: string;
      verification: LocalVerification;
    };

type Listener = (intent: SyncIntent) => void;

const listeners = new Set<Listener>();

export function emitSync(intent: SyncIntent): void {
  for (const l of listeners) l(intent);
}

export function onSync(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
