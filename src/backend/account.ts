/**
 * Effacement du compte (RGPD, art. 17 — droit à l'effacement).
 *
 * Tout se passe côté serveur, dans `delete_my_account()` (migration 0013) :
 * le client n'a ni le droit de vider `audit_logs` (aucune politique
 * d'écriture), ni celui de toucher `auth.users`. Il n'envoie donc pas une
 * liste de DELETE — il demande, et le serveur décide de qui il s'agit
 * (`auth.uid()`), jamais le paramètre d'un appel.
 */
import { getSupabase } from './supabaseClient';

export async function deleteMyAccount(): Promise<void> {
  const supabase = await getSupabase();
  // En mode local il n'y a pas de compte : l'app entière tient dans le
  // navigateur, et « Réinitialiser » suffit à tout effacer.
  if (!supabase) throw new Error('Mode local : aucun compte à supprimer.');
  const { error } = await supabase.rpc('delete_my_account');
  if (error) throw new Error(error.message);
}
