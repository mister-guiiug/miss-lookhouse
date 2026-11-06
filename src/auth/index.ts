/**
 * LA COUCHE AUTH DU SOCLE, BRANCHÉE SUR CETTE APP.
 *
 * Le câblage `getSession` → hydrater, `onAuthStateChange` → ré-hydrater,
 * drapeau de montage contre la réponse périmée, attente bornée de Supabase au
 * démarrage : tout cela vivait ici, dans `useAuth.tsx`, et dans quatre autres
 * apps. Le socle l'a promu en 3.33.0 — `auth/index` (le port), `auth/supabase`
 * (l'adaptateur), `react/auth-provider` (le fournisseur), `react/auth-gate`
 * (la porte) — à partir de cinq implémentations, dont celle-ci. Il ne reste
 * dans ce fichier que ce qui est PROPRE à l'app : un SDK chargé à la demande,
 * et l'adresse où le lien de connexion ramène. La garde hors ligne (« le
 * silence du réseau n'est pas une déconnexion »), écrite ici d'abord, est dans
 * l'adaptateur du socle depuis la 6.32.0.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  supabaseAuthAdapter,
  type SupabaseAuthAdapter,
} from '@mister-guiiug/dev-pwa-config/auth/supabase';
import { IS_SUPABASE } from '../backend/config';
import { supabaseStorageKey } from '@mister-guiiug/dev-pwa-config/supabase-client';
import { getSupabase } from '../backend/supabaseClient';

type AuthApi = SupabaseClient['auth'];

/** L'API `auth` du SDK. En mode `supabase`, `getSupabase()` ne rend jamais `null`. */
async function apiAuth(): Promise<AuthApi> {
  const client = await getSupabase();
  if (!client) throw new Error('Mode local : authentification indisponible.');
  return client.auth;
}

/**
 * LE SDK DERRIÈRE UN CHARGEMENT À LA DEMANDE.
 *
 * L'adaptateur du socle veut un client, pas une promesse ; l'app, elle, ne
 * charge le SDK Supabase (214 ko bruts) qu'au premier appel — c'est ce qui le
 * tient hors du préchargé du document. Chaque méthode attend donc le client
 * avant d'agir, SAUF l'abonnement : le port l'appelle de façon synchrone pour
 * recevoir son désabonnement. On lui rend le nôtre tout de suite, et le vrai
 * abonnement se pose quand le SDK arrive — ou ne se pose pas, si on s'est
 * désabonné entre-temps. (mister-settle fait le même détour par un `Proxy`,
 * mais son abonnement rend une promesse là où le port attend une fonction :
 * il survit à son appelant.)
 *
 * SA CASE DE SESSION, ELLE, EST CONNUE TOUT DE SUITE (`storageKey`) : hors
 * ligne, le socle lit la session sans appeler le SDK, et sans ce nom il
 * prendrait la première case `sb-*` du `localStorage` — que toute la famille
 * partage. Un accesseur, pour lire l'environnement au moment de la question.
 * Le calcul est celui du socle (6.31.0, promu d'ici), celui-là même que la
 * fabrique passe au client qu'elle crée, depuis la même `VITE_SUPABASE_URL`.
 * La fabrique n'est pas lue ici : les tests de la porte la remplacent.
 */
function sdkALaDemande(): { auth: object } {
  const auth = {
    get storageKey() {
      return supabaseStorageKey(import.meta.env.VITE_SUPABASE_URL);
    },
    getSession: async () => (await apiAuth()).getSession(),
    onAuthStateChange: (
      callback: Parameters<AuthApi['onAuthStateChange']>[0]
    ) => {
      let abonnement: { unsubscribe: () => void } | null = null;
      let annule = false;
      apiAuth()
        .then(api => {
          if (annule) return;
          abonnement = api.onAuthStateChange(callback).data.subscription;
        })
        .catch(() => {
          // SDK indisponible : `getSession` rendra la session écrite sur
          // l'appareil, et il n'y a aucun évènement à écouter.
        });
      return {
        data: {
          subscription: {
            unsubscribe: () => {
              annule = true;
              abonnement?.unsubscribe();
            },
          },
        },
      };
    },
    signInWithPassword: async (
      credentials: Parameters<AuthApi['signInWithPassword']>[0]
    ) => (await apiAuth()).signInWithPassword(credentials),
    signInWithOtp: async (
      credentials: Parameters<AuthApi['signInWithOtp']>[0]
    ) => (await apiAuth()).signInWithOtp(credentials),
    signUp: async (credentials: Parameters<AuthApi['signUp']>[0]) =>
      (await apiAuth()).signUp(credentials),
    signInAnonymously: async () => (await apiAuth()).signInAnonymously(),
    signOut: async () => (await apiAuth()).signOut(),
  };
  return { auth };
}

/**
 * L'ADAPTATEUR, OU RIEN.
 *
 * `null` en mode `local` : le fournisseur du socle se met alors en mode local
 * — prêt tout de suite, état figé « déconnecté », chaque action rend
 * `{ ok: false, error: { code: 'local-mode' } }` — et la porte laisse passer.
 *
 * À appeler UNE fois : `AuthProvider` lit l'adaptateur à la création de son
 * client et le recrée dès que l'identité change.
 */
export function authAdapter(): SupabaseAuthAdapter | null {
  if (!IS_SUPABASE) return null;
  // La garde hors ligne est dans l'adaptateur (socle 6.32.0) ; elle lit la
  // session de CE projet sous la case que l'enveloppe nomme (`storageKey`).
  return supabaseAuthAdapter({ client: sdkALaDemande() });
}

/**
 * OÙ LE LIEN DE CONNEXION RAMÈNE. Calculée depuis l'origine SERVIE, jamais
 * depuis une constante : le même bundle tourne en local et sur Pages. Cette
 * adresse doit figurer dans la liste d'URL autorisées du projet Supabase
 * (Authentication → URL Configuration), qui ne contient que localhost:3000 à
 * la création — sinon le lien part et n'arrive nulle part.
 *
 * Le client ne restreint pas l'inscription : le socle ne transmet pas
 * `shouldCreateUser`, et le SDK le vaut `true` par défaut — une adresse
 * inconnue demande aussi son lien, qui crée le compte. C'est le SERVEUR qui
 * tranche, par le hook « Before User Created » (migration 0018) quand
 * l'exploitant l'active ; son refus est dit en clair par `auth/inscription`.
 */
export function adresseDeRetour(): string {
  return `${window.location.origin}${import.meta.env.BASE_URL}`;
}
