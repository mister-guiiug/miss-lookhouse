/**
 * L'INSCRIPTION SUR INVITATION, VUE DE L'ÉCRAN DE CONNEXION.
 *
 * Le refus se décide sur le serveur : le hook « Before User Created » de
 * Supabase Auth (migration 0018, `lh_before_user_created`) rend une erreur
 * 403 quand l'inscription est sur invitation et que l'adresse n'est pas sur
 * la liste. Supabase Auth la transmet telle quelle, SANS code d'erreur stable
 * (`error_code` vide pour une erreur de hook) : on la reconnaît donc à son
 * message, que la migration écrit et que ce module lit — le changer d'un
 * côté, c'est le changer de l'autre.
 *
 * Le refus arrive aussi bien par l'inscription avec mot de passe que par le
 * lien de connexion demandé pour une adresse inconnue (le lien crée le
 * compte). Les comptes existants ne sont jamais concernés.
 */

/** Ce que la migration 0018 écrit — pour mémoire, et pour les tests. */
export const REFUS_INVITATION_SERVEUR = "L'inscription est sur invitation.";

/** Ce que l'écran affiche à la place : une phrase, pas une erreur technique. */
export const MESSAGE_INSCRIPTION_SUR_INVITATION =
  'L’inscription est sur invitation, et cette adresse n’a pas été invitée. ' +
  'Si vous devez avoir accès à Miss LookHouse, demandez une invitation à la ' +
  'personne qui l’administre — ou utilisez l’adresse qui a été invitée.';

/** L'erreur rendue par l'action du socle est-elle ce refus ? */
export function estRefusSurInvitation(
  error: { message?: string | null } | null | undefined
): boolean {
  const m = error?.message;
  return typeof m === 'string' && /sur invitation/i.test(m);
}

/** Le message à afficher pour une erreur de connexion ou d'inscription. */
export function messageErreurConnexion(error: {
  message?: string | null;
}): string {
  if (estRefusSurInvitation(error)) return MESSAGE_INSCRIPTION_SUR_INVITATION;
  // Le reste reste affiché tel que Supabase le rend, comme avant.
  return error.message ?? 'Une erreur est survenue. Réessayez.';
}
