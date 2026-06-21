/**
 * Synchronisation Supabase (offline-first). Au login : `pullAll` → hydrate le
 * store. Ensuite : chaque intention du store est mise en FILE PERSISTANTE
 * (`syncQueue`) puis drainée en série (rejeu sur échec transitoire,
 * dead-letter au-delà de MAX_ATTEMPTS) — plus rien n'est perdu silencieusement.
 * À la déconnexion : purge du miroir local + de la file. Ne fait RIEN en local.
 */
import { useEffect, useRef, useState } from 'react';
import { getSupabase } from './supabaseClient';
import { IS_SUPABASE } from './config';
import { useAuth } from '../auth/useAuth';
import { useAppStore } from '../store/useAppStore';
import { onSync, type SyncIntent } from './syncBus';
import {
  clearDeadLetter,
  clearQueue,
  deadLetterSize,
  drain,
  enqueue,
  queueSize,
} from './syncQueue';
import {
  addNoteRemote,
  addVerificationRemote,
  deleteSearchRemote,
  pullAll,
  setNotificationRead,
  upsertSearch,
  upsertStatus,
} from './repository';

type PullStatus = 'idle' | 'syncing' | 'ready' | 'error';
const RETRY_MS = 15_000;

export function SupabaseSync() {
  const { user } = useAuth();
  const hydrate = useAppStore(s => s.hydrate);
  const wipeLocal = useAppStore(s => s.wipeLocal);
  const [pull, setPull] = useState<PullStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(0);
  const [dead, setDead] = useState(0);
  const prevUserId = useRef<string | null>(null);

  // Déconnexion : purge le miroir local ET la file (appareil partagé / RGPD).
  useEffect(() => {
    if (!IS_SUPABASE) return;
    if (prevUserId.current && !user) {
      wipeLocal();
      clearQueue();
      clearDeadLetter();
      setPending(0);
      setDead(0);
    }
    prevUserId.current = user?.id ?? null;
  }, [user, wipeLocal]);

  // Pull à la connexion → hydrate.
  useEffect(() => {
    if (!IS_SUPABASE || !user) return;
    const supabase = getSupabase();
    if (!supabase) return;
    let active = true;
    setPull('syncing');
    setError(null);
    pullAll(supabase)
      .then(data => {
        if (active) {
          hydrate(data);
          setPull('ready');
        }
      })
      .catch(e => {
        if (active) {
          setPull('error');
          setError(
            e instanceof Error ? e.message : 'Erreur de synchronisation'
          );
        }
      });
    return () => {
      active = false;
    };
  }, [user, hydrate]);

  // Push via file persistante : enqueue → drain (série, rejeu, dead-letter).
  useEffect(() => {
    if (!IS_SUPABASE || !user) return;
    const supabase = getSupabase();
    if (!supabase) return;
    const userId = user.id;

    const processIntent = async (intent: SyncIntent): Promise<void> => {
      switch (intent.kind) {
        case 'upsertSearch':
          return upsertSearch(supabase, userId, intent.search);
        case 'deleteSearch':
          return deleteSearchRemote(supabase, intent.id);
        case 'upsertStatus':
          return upsertStatus(supabase, userId, intent.listingId, intent.entry);
        case 'addNote':
          return addNoteRemote(supabase, userId, intent.listingId, intent.note);
        case 'setNotificationRead':
          return setNotificationRead(supabase, intent.id, intent.readAt);
        case 'addVerification':
          return addVerificationRemote(
            supabase,
            userId,
            intent.listingId,
            intent.verification
          );
      }
    };

    let draining = false;
    let retryTimer: number | undefined;
    const refresh = () => {
      setPending(queueSize());
      setDead(deadLetterSize());
    };

    const runDrain = async () => {
      if (draining) return;
      draining = true;
      try {
        const res = await drain(processIntent);
        refresh();
        if (res.retried > 0) {
          // Échec transitoire : nouvel essai différé.
          if (retryTimer) window.clearTimeout(retryTimer);
          retryTimer = window.setTimeout(() => void runDrain(), RETRY_MS);
        }
      } finally {
        draining = false;
      }
    };

    const off = onSync(intent => {
      enqueue(intent);
      refresh();
      void runDrain();
    });
    const onOnline = () => void runDrain();
    window.addEventListener('online', onOnline);

    refresh();
    void runDrain(); // traite la file résiduelle d'une session précédente

    return () => {
      off();
      window.removeEventListener('online', onOnline);
      if (retryTimer) window.clearTimeout(retryTimer);
    };
  }, [user]);

  if (!IS_SUPABASE) return null;
  let message: string | null = null;
  if (pull === 'syncing') message = 'Synchronisation…';
  else if (pull === 'error') message = `Synchro : ${error ?? 'erreur'}`;
  else if (dead > 0)
    message = `${dead} synchro(s) en échec — réessai à la reconnexion`;
  else if (pending > 0) message = `${pending} en attente de synchronisation…`;
  if (!message) return null;
  return (
    <div className="sync-banner" role="status">
      {message}
    </div>
  );
}
