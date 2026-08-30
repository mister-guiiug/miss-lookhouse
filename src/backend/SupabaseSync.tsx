/**
 * Synchronisation Supabase (offline-first). Au login : `pullAll` → hydrate le
 * store. Ensuite : chaque intention du store part dans la file PERSISTANTE du
 * socle (`syncQueue`) — drain en série, rejeu automatique en retrait
 * exponentiel dispersé, lettres mortes consultables et REJOUABLES au-delà des
 * tentatives — plus rien n'est perdu silencieusement. À la déconnexion : purge
 * du miroir local + de la file. Ne fait RIEN en local.
 */
import { useEffect, useRef, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabase } from './supabaseClient';
import { IS_SUPABASE } from './config';
import { useAuth } from '../auth/useAuth';
import { useAppStore } from '../store/useAppStore';
import { onSync, type SyncIntent } from './syncBus';
import {
  clearPersistedQueues,
  createIntentQueue,
  type IntentQueue,
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

function processIntent(
  supabase: SupabaseClient,
  userId: string,
  intent: SyncIntent
): Promise<void> {
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
}

export function SupabaseSync() {
  const { user } = useAuth();
  const hydrate = useAppStore(s => s.hydrate);
  const wipeLocal = useAppStore(s => s.wipeLocal);
  const [pull, setPull] = useState<PullStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(0);
  const [dead, setDead] = useState(0);
  const [refused, setRefused] = useState(false);
  const prevUserId = useRef<string | null>(null);
  const queueRef = useRef<IntentQueue | null>(null);

  // Déconnexion : purge le miroir local ET la file (appareil partagé / RGPD).
  useEffect(() => {
    if (!IS_SUPABASE) return;
    if (prevUserId.current && !user) {
      wipeLocal();
      queueRef.current?.clear();
      queueRef.current = null;
      clearPersistedQueues(); // même si la file n'a jamais été construite
      setPending(0);
      setDead(0);
      setRefused(false);
    }
    prevUserId.current = user?.id ?? null;
  }, [user, wipeLocal]);

  // Pull à la connexion → hydrate.
  useEffect(() => {
    if (!IS_SUPABASE || !user) return;
    let active = true;
    setPull('syncing');
    setError(null);
    getSupabase()
      .then(supabase => {
        if (!supabase) return null;
        return pullAll(supabase);
      })
      .then(data => {
        if (active && data) {
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

  // Push via la file du socle : enqueue → flush (drain sérialisé, rejeu en
  // retrait exponentiel, lettre morte). `start()` draine la file résiduelle
  // d'une session précédente puis rejoue à chaque retour en ligne.
  useEffect(() => {
    if (!IS_SUPABASE || !user) return;
    const userId = user.id;
    let disposed = false;
    let offSync: (() => void) | null = null;

    getSupabase()
      .then(supabase => {
        if (!supabase || disposed) return;
        const queue = createIntentQueue({
          process: intent => processIntent(supabase, userId, intent),
          onChange: status => {
            if (disposed) return;
            setPending(status.pending);
            setDead(status.dead);
          },
        });
        queueRef.current = queue;
        setPending(queue.pending());
        setDead(queue.deadLetters().length);
        offSync = onSync(intent => {
          // `null` = plafond atteint : refuser VISIBLEMENT vaut mieux que
          // jeter en silence.
          setRefused(queue.enqueue(intent) === null);
          void queue.flush();
        });
        void queue.start();
      })
      .catch(() => {
        /* SDK indisponible : la file persiste, reprise à la prochaine session */
      });

    return () => {
      disposed = true;
      offSync?.();
      queueRef.current?.stop();
    };
  }, [user]);

  const retryDead = () => {
    const queue = queueRef.current;
    if (!queue) return;
    queue.requeueDead();
    void queue.flush();
  };

  if (!IS_SUPABASE) return null;
  let message: string | null = null;
  if (pull === 'syncing') message = 'Synchronisation…';
  else if (pull === 'error') message = `Synchro : ${error ?? 'erreur'}`;
  else if (refused)
    message = 'File de synchronisation pleine — modification non synchronisée';
  else if (dead > 0) message = `${dead} synchro(s) en échec`;
  else if (pending > 0) message = `${pending} en attente de synchronisation…`;
  if (!message) return null;
  return (
    <div className="sync-banner" role="status">
      {message}
      {pull !== 'syncing' && pull !== 'error' && !refused && dead > 0 && (
        <button
          type="button"
          className="btn"
          style={{ marginLeft: '0.6rem' }}
          onClick={retryDead}
        >
          Réessayer
        </button>
      )}
    </div>
  );
}
