/**
 * Sélection du backend. `local` (défaut) : 100 % navigateur, idéal GitHub Pages
 * et démo hors-ligne. `supabase` : auth + RBAC/RLS serveur + ingestion planifiée.
 * On n'active réellement `supabase` que si l'URL et la clé anon sont présentes,
 * sinon repli propre sur `local` — le jugement est celui du socle
 * (`supabaseConfig`, même `missingConfig` que la fabrique de client) : une
 * variable vide ou blanche est absente.
 */
import { supabaseConfig } from '@mister-guiiug/dev-pwa-config/supabase-client';

const declared = (import.meta.env.VITE_BACKEND ?? 'local') as
  | 'local'
  | 'supabase';

const hasSupabaseEnv = supabaseConfig(import.meta.env).missing.length === 0;

export const BACKEND: 'local' | 'supabase' =
  declared === 'supabase' && hasSupabaseEnv ? 'supabase' : 'local';

export const IS_SUPABASE = BACKEND === 'supabase';
export const IS_LOCAL = BACKEND === 'local';
