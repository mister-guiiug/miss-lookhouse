/**
 * Synchronisation Supabase (offline-first). Au login : la file d'abord — ce qui
 * attend part —, PUIS `pullAll` → hydrate le store, et seulement quand la file
 * est vide. Ensuite : chaque intention du store part dans la file PERSISTANTE du
 * socle (`syncQueue`) — drain en série, rejeu automatique en retrait
 * exponentiel dispersé, lettres mortes consultables et REJOUABLES au-delà des
 * tentatives — plus rien n'est perdu silencieusement. Un pull qui a échoué
 * (démarrage hors ligne) est rejoué au retour du réseau. À la déconnexion :
 * purge du miroir local + de la file. Ne fait RIEN en local.
 */
import { useEffect, useRef, useState } from 'react';
import type { SupabaseClient, User } from '@supabase/supabase-js';
import { useAuthContext } from '@mister-guiiug/dev-pwa-config/react/auth-provider';
import { useRetryWhenOnline } from '@mister-guiiug/dev-pwa-config/react/use-retry-when-online';
import { useToast } from '@mister-guiiug/dev-pwa-config/react/toast';
import { getSupabase } from './supabaseClient';
import { IS_SUPABASE } from './config';
import { useAppStore } from '../store/useAppStore';
import { onSync, type SyncIntent } from './syncBus';
import {
  clearPersistedQueues,
  createIntentQueue,
  unsentCount,
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
  const { user } = useAuthContext<unknown, User>();
  const hydrate = useAppStore(s => s.hydrate);
  const wipeLocal = useAppStore(s => s.wipeLocal);
  const toast = useToast();
  const [pull, setPull] = useState<PullStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(0);
  const [dead, setDead] = useState(0);
  const [refused, setRefused] = useState(false);
  const prevUserId = useRef<string | null>(null);
  const queueRef = useRef<IntentQueue | null>(null);
  /** Rejoue la file puis le pull : posé par l'effet de session. */
  const relancerRef = useRef<(() => void) | null>(null);

  // Déconnexion : purge le miroir local ET la file (appareil partagé / RGPD).
  useEffect(() => {
    if (!IS_SUPABASE) return;
    if (prevUserId.current && !user) {
      // Compté AVANT la purge. Une déconnexion demandée a déjà vidé la file
      // avec l'accord de la personne (Réglages) : il ne reste rien. Ce qui
      // reste ici vient d'une déconnexion SUBIE — jeton révoqué, session
      // fermée ailleurs — à laquelle personne n'a pu répondre : on purge
      // quand même, mais on dit ce qui part avec.
      const perdues = unsentCount();
      wipeLocal();
      queueRef.current?.clear();
      queueRef.current = null;
      clearPersistedQueues(); // même si la file n'a jamais été construite
      setPending(0);
      setDead(0);
      setRefused(false);
      if (perdues > 0)
        toast.error(
          `Session fermée : ${perdues} modification(s) non envoyée(s) ont été supprimées de cet appareil.`,
          { id: 'sync-perdues-deconnexion' }
        );
    }
    prevUserId.current = user?.id ?? null;
  }, [user, wipeLocal, toast]);

  /*
   * LA FILE D'ABORD, LE PULL ENSUITE — ET SEULEMENT QUAND ELLE EST VIDE.
   *
   * Les deux partaient en parallèle à la connexion, et `hydrate` REMPLACE le
   * store par l'état du serveur. Une écriture encore en file — hors ligne,
   * serveur qui tousse — disparaissait donc de l'écran. Pire : l'écriture
   * suivante sur la même entité, construite sur cet état, REMPLAÇAIT dans la
   * file celle qui attendait (même clé d'entité) — un statut changé hors ligne,
   * puis une étiquette, et le statut partait à la trappe.
   *
   * Le pull est donc DÛ, et ne part que file vide : après le premier drain, ou
   * dès que la file se vide (fin d'un rejeu, retour du réseau). Une écriture
   * survenue PENDANT la lecture rend sa réponse périmée : elle n'est pas posée,
   * et le pull redevient dû.
   */
  useEffect(() => {
    if (!IS_SUPABASE || !user) return;
    const userId = user.id;
    let disposed = false;
    let offSync: (() => void) | null = null;
    let pullDu = true;
    let pullEnCours = false;
    /** Écritures enfilées depuis l'ouverture de la session. */
    let ecritures = 0;

    getSupabase()
      .then(supabase => {
        if (!supabase || disposed) return;
        // Typé non nul : la fonction `tirerSiDu`, plus bas, ne voit pas le
        // rétrécissement du test ci-dessus.
        const client: SupabaseClient = supabase;

        const queue = createIntentQueue({
          process: intent => processIntent(client, userId, intent),
          onChange: status => {
            if (disposed) return;
            setPending(status.pending);
            setDead(status.dead);
            // La file vient de se vider : le pull qui l'attendait peut partir.
            if (status.pending === 0) void tirerSiDu();
          },
        });
        queueRef.current = queue;
        setPending(queue.pending());
        setDead(queue.deadLetters().length);

        /** Le pull, s'il est dû et que la file est vide. */
        async function tirerSiDu(): Promise<void> {
          if (disposed || !pullDu || pullEnCours || queue.pending() > 0) return;
          pullDu = false;
          pullEnCours = true;
          const avant = ecritures;
          let perimee = false;
          setPull('syncing');
          setError(null);
          try {
            const data = await pullAll(client);
            if (disposed) return;
            perimee = ecritures !== avant || queue.pending() > 0;
            if (perimee) {
              // Une écriture est partie, ou attend, pendant la lecture : la
              // réponse la précède. On la jette ; le pull redevient dû.
              pullDu = true;
              setPull('idle');
            } else {
              hydrate(data);
              setPull('ready');
            }
          } catch (e) {
            if (disposed) return;
            // PAS redû d'ici : la fin d'un drain le relancerait aussitôt, sur
            // le même réseau absent. C'est le retour du réseau (plus bas) qui
            // le réarme.
            setPull('error');
            setError(
              e instanceof Error ? e.message : 'Erreur de synchronisation'
            );
          } finally {
            pullEnCours = false;
          }
          // L'écriture a déjà été acquittée : la file est vide et ne dira plus
          // rien. Sinon, c'est sa fin de drain (`onChange`) qui relancera.
          if (perimee) void tirerSiDu();
        }

        offSync = onSync(intent => {
          ecritures += 1;
          // `null` = plafond atteint : refuser VISIBLEMENT vaut mieux que
          // jeter en silence.
          setRefused(queue.enqueue(intent) === null);
          void queue.flush();
        });
        relancerRef.current = () => {
          pullDu = true;
          void queue.flush().then(tirerSiDu);
        };
        // `start()` draine la file résiduelle d'une session précédente, puis
        // rejoue à chaque retour en ligne ; le pull suit le premier drain.
        void queue.start().then(tirerSiDu);
      })
      .catch(() => {
        /* SDK indisponible : la file persiste, reprise à la prochaine session */
      });

    return () => {
      disposed = true;
      offSync?.();
      relancerRef.current = null;
      queueRef.current?.stop();
    };
  }, [user, hydrate]);

  // UN DÉMARRAGE HORS LIGNE N'EST PAS DÉFINITIF. Le pull échoue (« Failed to
  // fetch ») et, sans ceci, ne repartait jamais : la session gardait l'état
  // d'avant la coupure. Au retour du réseau — après le répit du socle —, on
  // rejoue la file puis le pull.
  useRetryWhenOnline(pull === 'error', () => relancerRef.current?.());

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
