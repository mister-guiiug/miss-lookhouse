/**
 * Synchronisation Supabase (offline-first léger). Au login : `pullAll` →
 * hydrate le store. Ensuite : pousse les intentions du store (syncBus) vers le
 * dépôt. À la déconnexion : purge le miroir local. Rend un bandeau de statut.
 * Ne fait RIEN en mode local (rend null).
 */
import { useEffect, useRef, useState } from 'react';
import { getSupabase } from './supabaseClient';
import { IS_SUPABASE } from './config';
import { useAuth } from '../auth/useAuth';
import { useAppStore } from '../store/useAppStore';
import { onSync, type SyncIntent } from './syncBus';
import {
  addNoteRemote,
  addVerificationRemote,
  deleteSearchRemote,
  pullAll,
  setNotificationRead,
  upsertSearch,
  upsertStatus,
} from './repository';

type Status = 'idle' | 'syncing' | 'ready' | 'error';

export function SupabaseSync() {
  const { user } = useAuth();
  const hydrate = useAppStore(s => s.hydrate);
  const wipeLocal = useAppStore(s => s.wipeLocal);
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);
  const prevUserId = useRef<string | null>(null);

  // Purge le miroir local lors de la transition connecté → déconnecté.
  useEffect(() => {
    if (!IS_SUPABASE) return;
    if (prevUserId.current && !user) wipeLocal();
    prevUserId.current = user?.id ?? null;
  }, [user, wipeLocal]);

  // Pull à la connexion → hydrate.
  useEffect(() => {
    if (!IS_SUPABASE || !user) return;
    const supabase = getSupabase();
    if (!supabase) return;
    let active = true;
    setStatus('syncing');
    setError(null);
    pullAll(supabase)
      .then(data => {
        if (active) {
          hydrate(data);
          setStatus('ready');
        }
      })
      .catch(e => {
        if (active) {
          setStatus('error');
          setError(
            e instanceof Error ? e.message : 'Erreur de synchronisation'
          );
        }
      });
    return () => {
      active = false;
    };
  }, [user, hydrate]);

  // Push : route les intentions du store vers le dépôt (RLS appliquée).
  useEffect(() => {
    if (!IS_SUPABASE || !user) return;
    const supabase = getSupabase();
    if (!supabase) return;
    const userId = user.id;
    const run = async (intent: SyncIntent) => {
      try {
        switch (intent.kind) {
          case 'upsertSearch':
            await upsertSearch(supabase, userId, intent.search);
            break;
          case 'deleteSearch':
            await deleteSearchRemote(supabase, intent.id);
            break;
          case 'upsertStatus':
            await upsertStatus(
              supabase,
              userId,
              intent.listingId,
              intent.entry
            );
            break;
          case 'addNote':
            await addNoteRemote(
              supabase,
              userId,
              intent.listingId,
              intent.note
            );
            break;
          case 'setNotificationRead':
            await setNotificationRead(supabase, intent.id, intent.readAt);
            break;
          case 'addVerification':
            await addVerificationRemote(
              supabase,
              userId,
              intent.listingId,
              intent.verification
            );
            break;
        }
      } catch (e) {
        setStatus('error');
        setError(e instanceof Error ? e.message : 'Erreur de synchronisation');
      }
    };
    return onSync(intent => {
      void run(intent);
    });
  }, [user]);

  if (!IS_SUPABASE || status === 'idle' || status === 'ready') return null;
  return (
    <div className="sync-banner" role="status">
      {status === 'syncing'
        ? 'Synchronisation…'
        : `Synchro : ${error ?? 'erreur'}`}
    </div>
  );
}
