import { useEffect } from 'react';
import { useToast } from '@mister-guiiug/dev-pwa-config/react/toast';
import { onSaveFailure } from '../store/persistence';

/**
 * Dit qu'une sauvegarde locale a été refusée — stockage plein, navigation
 * privée. `saveState` avalait l'erreur : l'écran restait juste, mais rien ne
 * survivait à la fermeture, et rien ne le disait.
 *
 * UN SEUL MESSAGE. Chaque modification retente la sauvegarde, et chaque échec
 * le redirait : l'identifiant stable le remplace au lieu d'en empiler. Le ton
 * `error` le rend permanent — on le ferme, il ne s'efface pas tout seul.
 *
 * Monté sous `ToastProvider`, au-dessus de la garde d'authentification : la
 * démo locale écrit aussi, et dès le premier lancement.
 */
export function SaveFailureToast() {
  const toast = useToast();

  useEffect(
    () =>
      onSaveFailure(() => {
        toast.error(
          'Stockage de l’appareil plein : vos dernières modifications ne sont plus enregistrées sur cet appareil. Libérez de l’espace dans le navigateur.',
          { id: 'sauvegarde-locale-refusee' }
        );
      }),
    [toast]
  );

  return null;
}
