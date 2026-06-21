/**
 * Garde d'authentification. En mode `local` : laisse tout passer. En mode
 * `supabase` : affiche l'écran de connexion tant qu'aucune session valide.
 */
import type { ReactNode } from 'react';
import { IS_SUPABASE } from '../backend/config';
import { useAuth } from './useAuth';
import { LoginScreen } from '../features/auth/LoginScreen';

export function AuthGate({ children }: { children: ReactNode }) {
  const { ready, user } = useAuth();

  if (!IS_SUPABASE) return <>{children}</>;
  if (!ready) {
    return (
      <div className="empty" style={{ paddingTop: '4rem' }}>
        Chargement…
      </div>
    );
  }
  if (!user) return <LoginScreen />;
  return <>{children}</>;
}
