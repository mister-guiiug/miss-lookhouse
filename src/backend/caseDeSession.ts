/**
 * LA CASE OÙ LE SDK RANGE LA SESSION DE CE PROJET, sans attendre le SDK.
 *
 * Toute la famille est servie depuis la même origine, donc le même
 * `localStorage` : sur un appareil qui sert aussi à une autre app Supabase du
 * parc, deux cases `sb-*-auth-token` cohabitent. `storedSupabaseSession(client)`
 * du socle (6.30.0) lit celle que le client nomme dans `auth.storageKey` ; sans
 * nom, il prend la première venue, qui peut être celle de l'autre app.
 *
 * Ici le SDK est chargé à la demande (`supabaseClient.ts`) : au démarrage hors
 * ligne, il n'est pas encore là pour dire sa case. Le nom se dérive donc de
 * l'URL du projet, comme le fait le SDK (`SupabaseClient`, « defaultStorageKey ») —
 * et `caseDeSession.test.ts` le confronte au SDK installé, pour qu'une montée
 * qui changerait la formule se voie. Même geste que miss-holi-voyage.
 */
export function caseDeSession(
  url: string | undefined = import.meta.env.VITE_SUPABASE_URL
): string | undefined {
  if (!url) return undefined;
  try {
    return `sb-${new URL(url).hostname.split('.')[0]}-auth-token`;
  } catch {
    return undefined;
  }
}
