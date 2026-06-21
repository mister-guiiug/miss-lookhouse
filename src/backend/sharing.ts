/**
 * Partage de recherches (lecture) via fonctions SECURITY DEFINER serveur
 * (cf. migrations 0006/0007). Le client ne touche jamais `auth.users` ni la
 * table `search_shares` en écriture : tout passe par les RPC, qui vérifient la
 * propriété. Disponible en mode Supabase uniquement.
 */
import { getSupabase } from './supabaseClient';

export type ShareRole = 'viewer' | 'editor';

export interface Share {
  sharedWith: string;
  email: string;
  role: ShareRole;
}

/** Partage la recherche (en lecture) avec le compte de cet e-mail. */
export async function shareSearch(
  searchId: string,
  email: string
): Promise<void> {
  const s = getSupabase();
  if (!s) throw new Error('Mode local : partage indisponible.');
  const { error } = await s.rpc('lh_share_search', {
    p_search_id: searchId,
    p_email: email.trim(),
  });
  if (error) throw new Error(error.message);
}

export async function unshareSearch(
  searchId: string,
  userId: string
): Promise<void> {
  const s = getSupabase();
  if (!s) return;
  const { error } = await s.rpc('lh_unshare_search', {
    p_search_id: searchId,
    p_user_id: userId,
  });
  if (error) throw new Error(error.message);
}

/** Liste les partages d'une recherche (réservé au propriétaire ; lève sinon). */
export async function listShares(searchId: string): Promise<Share[]> {
  const s = getSupabase();
  if (!s) return [];
  const { data, error } = await s.rpc('lh_list_shares', {
    p_search_id: searchId,
  });
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as Array<{
    shared_with: string;
    email: string;
    role: ShareRole;
  }>;
  return rows.map(r => ({
    sharedWith: r.shared_with,
    email: r.email,
    role: r.role,
  }));
}
