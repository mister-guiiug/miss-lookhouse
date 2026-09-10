/**
 * Contexte d'authentification. En mode `local`, l'app fonctionne sans compte
 * (provider « prêt » sans session). En mode `supabase`, on s'abonne aux
 * changements de session ; la sécurité réelle est arbitrée par la RLS serveur.
 */
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { getSupabase } from '../backend/supabaseClient';
import { IS_SUPABASE } from '../backend/config';
import {
  navigateurHorsLigne,
  storedSupabaseSession,
} from '@mister-guiiug/dev-pwa-config/auth/stored-session';

export interface AuthValue {
  ready: boolean;
  user: User | null;
  session: Session | null;
  signIn: (
    email: string,
    password: string
  ) => Promise<{ error: string | null }>;
  signUp: (
    email: string,
    password: string
  ) => Promise<{ error: string | null; needsConfirmation: boolean }>;
  /**
   * Un lien à usage unique, par e-mail : l'application ne voit passer aucun
   * secret et n'en stocke aucun. C'est l'entrée par défaut depuis l'étape 5
   * d'AMELIORATIONS.md ; le mot de passe reste possible, il n'est plus le
   * défaut. Une adresse inconnue reçoit aussi son lien : c'est l'inscription
   * sans mot de passe.
   */
  signInWithLink: (email: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
}

/**
 * COMBIEN DE TEMPS ON ACCEPTE D'ATTENDRE SUPABASE AU DÉMARRAGE.
 *
 * `auth.getSession()` n'est pas une lecture : jeton périmé, il part le
 * renouveler contre le réseau, avec des reprises bornées par sa propre fenêtre
 * de rafraîchissement — une trentaine de secondes. Passé ce délai on démarre
 * sur la session écrite sur l'appareil, et `onAuthStateChange` corrige.
 */
const ATTENTE_MAX_MS = 5_000;

/** Marqueur d'attente dépassée, distinct de `null` (« pas de session »). */
const TROP_LONG = Symbol('attente dépassée');

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  // En local, prêt immédiatement (pas d'auth).
  const [ready, setReady] = useState(!IS_SUPABASE);
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    let active = true;
    let subscription: { unsubscribe: () => void } | null = null;
    getSupabase()
      .then(supabase => {
        if (!supabase) {
          if (active) setReady(true);
          return;
        }
        /**
         * L'AMORÇAGE NE DOIT JAMAIS DÉPENDRE DU RÉSEAU.
         *
         * Avant, il en dépendait entièrement. Hors ligne avec un jeton périmé
         * — c'est-à-dire dès qu'une heure a passé — `getSession()` tournait
         * 26 secondes avant de renoncer et d'annoncer « pas de session », et
         * `AuthGate` affichait alors l'écran de CONNEXION, qu'on ne peut pas
         * franchir sans réseau. Mesuré sur la production le 2026-09-10.
         *
         * Le repli ne dégrade rien quand le réseau est là : c'est la même
         * session, simplement pas encore renouvelée, et `onAuthStateChange`
         * la corrigera — `TOKEN_REFRESHED` au retour, `SIGNED_OUT` si le
         * jeton de rafraîchissement a été révoqué.
         */
        void (async () => {
          const stockee = storedSupabaseSession() as Session | null;

          // Hors ligne : ne rien demander. Supabase n'a que le réseau pour
          // répondre, et il met une demi-minute à l'admettre.
          if (navigateurHorsLigne() && stockee) {
            if (!active) return;
            setSession(stockee);
            setReady(true);
            return;
          }

          // En ligne — ou ce que le navigateur appelle ainsi : `onLine` est
          // vrai derrière un portail captif comme sur un Wi-Fi qui ne route
          // rien. D'où l'attente bornée.
          let minuteur: ReturnType<typeof setTimeout> | undefined;
          const issue = await Promise.race([
            supabase.auth.getSession().then(({ data }) => data.session),
            new Promise<typeof TROP_LONG>(resoudre => {
              minuteur = setTimeout(() => resoudre(TROP_LONG), ATTENTE_MAX_MS);
            }),
          ]);
          clearTimeout(minuteur);
          if (!active) return;
          setSession(issue === TROP_LONG ? stockee : issue);
          setReady(true);
        })();
        const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
          if (active) setSession(s);
        });
        subscription = sub.subscription;
        if (!active) subscription.unsubscribe();
      })
      .catch(() => {
        // Client indisponible (SDK non chargé) : l'app reste utilisable sans
        // session plutôt que bloquée sur l'écran d'attente.
        if (active) setReady(true);
      });
    return () => {
      active = false;
      subscription?.unsubscribe();
    };
  }, []);

  const signIn = async (email: string, password: string) => {
    const supabase = await getSupabase();
    if (!supabase)
      return { error: 'Mode local : authentification indisponible.' };
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    return { error: error?.message ?? null };
  };

  const signUp = async (email: string, password: string) => {
    const supabase = await getSupabase();
    if (!supabase) {
      return {
        error: 'Mode local : inscription indisponible.',
        needsConfirmation: false,
      };
    }
    const { data, error } = await supabase.auth.signUp({ email, password });
    // Si la confirmation e-mail est activée, aucune session n'est renvoyée.
    return {
      error: error?.message ?? null,
      needsConfirmation: !error && !data.session,
    };
  };

  const signInWithLink = async (email: string) => {
    const supabase = await getSupabase();
    if (!supabase)
      return { error: 'Mode local : authentification indisponible.' };
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        // Le retour du lien est calculé depuis l'origine SERVIE, jamais depuis
        // une constante : le même bundle tourne en local et sur Pages. Cette
        // adresse doit figurer dans la liste d'URL autorisées du projet
        // Supabase (Authentication → URL Configuration), qui ne contient que
        // localhost:3000 à la création — sinon le lien part et n'arrive nulle
        // part.
        emailRedirectTo: `${window.location.origin}${import.meta.env.BASE_URL}`,
        // L'inscription est libre ici (`signUp` existe) : le lien crée le
        // compte s'il n'existe pas, sans mot de passe à choisir.
        shouldCreateUser: true,
      },
    });
    return { error: error?.message ?? null };
  };

  const signOut = async () => {
    const supabase = await getSupabase();
    if (supabase) await supabase.auth.signOut();
  };

  const value: AuthValue = {
    ready,
    user: session?.user ?? null,
    session,
    signIn,
    signUp,
    signInWithLink,
    signOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth doit être utilisé dans <AuthProvider>.');
  return ctx;
}
