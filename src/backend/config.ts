/**
 * Sélection du backend. `local` (défaut) : 100 % navigateur, idéal GitHub Pages
 * et démo hors-ligne. `supabase` : auth + RBAC/RLS serveur + ingestion planifiée.
 * On n'active réellement `supabase` que si l'URL et la clé anon sont présentes,
 * sinon repli propre sur `local`.
 */
const declared = (import.meta.env.VITE_BACKEND ?? 'local') as
  | 'local'
  | 'supabase';

const hasSupabaseEnv = Boolean(
  import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY
);

export const BACKEND: 'local' | 'supabase' =
  declared === 'supabase' && hasSupabaseEnv ? 'supabase' : 'local';

export const IS_SUPABASE = BACKEND === 'supabase';
export const IS_LOCAL = BACKEND === 'local';
