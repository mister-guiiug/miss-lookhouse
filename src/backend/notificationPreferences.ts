/**
 * L'opt-in aux alertes par E-MAIL (`notification_preferences.email_enabled`,
 * `false` par défaut depuis 0001 ; canal câblé dans `notify` par 0017).
 *
 * Écrit sous la RLS propriétaire de 0002 : on ne pose que SA ligne. L'adresse
 * n'est jamais envoyée d'ici — c'est celle du compte, que `notify` lit côté
 * serveur, et seulement si elle est confirmée.
 */
import { getSupabase } from './supabaseClient';

/** L'opt-in actuel ; `false` sans ligne de préférences (le défaut serveur). */
export async function getEmailOptIn(userId: string): Promise<boolean> {
  const s = await getSupabase();
  if (!s) return false;
  const { data, error } = await s
    .from('notification_preferences')
    .select('email_enabled')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return Boolean((data as { email_enabled?: boolean } | null)?.email_enabled);
}

/** Pose l'opt-in sur la ligne de l'utilisateur (créée au besoin). */
export async function setEmailOptIn(
  userId: string,
  enabled: boolean
): Promise<void> {
  const s = await getSupabase();
  if (!s) throw new Error('Mode local : pas d’alertes par e-mail.');
  const { error } = await s
    .from('notification_preferences')
    .upsert(
      { user_id: userId, email_enabled: enabled },
      { onConflict: 'user_id' }
    );
  if (error) throw new Error(error.message);
}
