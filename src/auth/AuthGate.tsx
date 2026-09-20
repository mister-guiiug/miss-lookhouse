/**
 * LA PORTE DE L'APP : la garde du socle (`react/auth-gate`), plus les trois
 * décisions de produit qu'elle ne prend pas par construction — le mode local
 * qui laisse passer, le « Chargement… » de cette app, l'écran de connexion.
 *
 * En mode `local` : tout passe. En mode `supabase` : « Chargement… » tant que
 * la session n'est pas lue, l'écran de connexion sans session, l'application
 * ensuite. La sécurité réelle reste côté serveur, dans les politiques RLS —
 * une garde d'interface se contourne dans l'inspecteur.
 *
 * Pas de `mfa` : l'app n'enrôle aucun facteur, le port n'atteint jamais
 * `needs-mfa` ici.
 */
import type { ReactNode } from 'react';
import { AuthGate as PorteDuSocle } from '@mister-guiiug/dev-pwa-config/react/auth-gate';
import { useAuthContext } from '@mister-guiiug/dev-pwa-config/react/auth-provider';
import { IS_SUPABASE } from '../backend/config';
import { LoginScreen } from '../features/auth/LoginScreen';

export function AuthGate({ children }: { children: ReactNode }) {
  const { client } = useAuthContext();
  return (
    <PorteDuSocle
      client={client}
      bypass={!IS_SUPABASE}
      loading={
        <div className="empty" style={{ paddingTop: '4rem' }}>
          Chargement…
        </div>
      }
      fallback={<LoginScreen />}
    >
      {children}
    </PorteDuSocle>
  );
}
