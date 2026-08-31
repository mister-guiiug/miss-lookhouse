/**
 * Ce que le bandeau hors-ligne a le droit de promettre, selon le mode.
 *
 * En Supabase, la file persistante du socle existe vraiment : les six
 * intentions du store sont conservées et rejouées au retour du réseau.
 * Promettre l'envoi différé n'est donc pas une politesse, c'est exact.
 *
 * En local, il n'y a rien à envoyer — le promettre serait un mensonge, et un
 * mensonge que personne ne viendrait signaler.
 *
 * (Fonction isolée du composant : `react-refresh` refuse qu'un module exporte
 * à la fois un composant et autre chose.)
 */
export function offlineLabel(isSupabase: boolean): string {
  return isSupabase
    ? 'Hors ligne — vos modifications sont conservées et partiront au retour du réseau.'
    : 'Hors ligne — l’application continue sur les données de cet appareil.';
}
