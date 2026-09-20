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
 * une garde que le socle n'a pas, et l'adresse où le lien de connexion ramène.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  supabaseAuthAdapter,
  type SupabaseAuthAdapter,
} from '@mister-guiiug/dev-pwa-config/auth/supabase';
import {
  navigateurHorsLigne,
  storedSupabaseSession,
} from '@mister-guiiug/dev-pwa-config/auth/stored-session';
import { IS_SUPABASE } from '../backend/config';
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
 */
function sdkALaDemande(): { auth: object } {
  const auth = {
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
 * LE SILENCE DU RÉSEAU N'EST PAS UNE DÉCONNEXION — la garde que le socle n'a
 * pas, et la raison d'être de ce fichier.
 *
 * Supabase s'abonne en émettant l'état initial, et cet état passe par le
 * renouvellement du jeton : hors ligne il n'aboutit pas, et au bout d'une
 * demi-minute la bibliothèque annonce « pas de session ». Mesuré sur un build
 * de production après #78 : ouverte à 3 s, ÉJECTÉE sur l'écran de connexion
 * avant 30. Le port du socle traduit tout évènement sans session en
 * « déconnecté » ; sa lecture bornée (`getSession`) protège l'amorçage, pas
 * ce qui suit.
 *
 * LA DISTINCTION TIENT AU STOCKAGE, et elle est nette : lors d'une vraie
 * déconnexion, Supabase EFFACE la session AVANT d'émettre `SIGNED_OUT`. Si
 * elle est encore là, c'est qu'il n'a déconnecté personne — il a renoncé à
 * joindre le serveur. Une déconnexion demandée sans réseau reste donc
 * honorée : le stockage est vidé d'abord, la garde ne se déclenche pas.
 */
function avecLaGardeHorsLigne(
  adaptateur: SupabaseAuthAdapter
): SupabaseAuthAdapter {
  return {
    ...adaptateur,
    onAuthStateChange: callback =>
      adaptateur.onAuthStateChange((event, session) => {
        if (!session && navigateurHorsLigne() && storedSupabaseSession()) {
          return;
        }
        callback(event, session);
      }),
  };
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
  return avecLaGardeHorsLigne(supabaseAuthAdapter({ client: sdkALaDemande() }));
}

/**
 * OÙ LE LIEN DE CONNEXION RAMÈNE. Calculée depuis l'origine SERVIE, jamais
 * depuis une constante : le même bundle tourne en local et sur Pages. Cette
 * adresse doit figurer dans la liste d'URL autorisées du projet Supabase
 * (Authentication → URL Configuration), qui ne contient que localhost:3000 à
 * la création — sinon le lien part et n'arrive nulle part.
 *
 * L'inscription reste libre : le socle ne transmet pas `shouldCreateUser`, et
 * le SDK le vaut `true` par défaut — une adresse inconnue reçoit aussi son
 * lien, qui crée le compte, comme avant.
 */
export function adresseDeRetour(): string {
  return `${window.location.origin}${import.meta.env.BASE_URL}`;
}
