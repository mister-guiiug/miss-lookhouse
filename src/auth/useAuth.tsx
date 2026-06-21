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
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  // En local, prêt immédiatement (pas d'auth).
  const [ready, setReady] = useState(!IS_SUPABASE);
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    const supabase = getSupabase();
    if (!supabase) {
      setReady(true);
      return;
    }
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const signIn = async (email: string, password: string) => {
    const supabase = getSupabase();
    if (!supabase)
      return { error: 'Mode local : authentification indisponible.' };
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    return { error: error?.message ?? null };
  };

  const signUp = async (email: string, password: string) => {
    const supabase = getSupabase();
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

  const signOut = async () => {
    const supabase = getSupabase();
    if (supabase) await supabase.auth.signOut();
  };

  const value: AuthValue = {
    ready,
    user: session?.user ?? null,
    session,
    signIn,
    signUp,
    signOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth doit être utilisé dans <AuthProvider>.');
  return ctx;
}
