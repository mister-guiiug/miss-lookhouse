/**
 * Le message « Recherche supprimée · Annuler », et rien d'autre.
 *
 * POURQUOI UN COMPOSANT À PART, MONTÉ AU NIVEAU DE L'APP. Le message doit
 * survivre à un changement d'écran : on supprime depuis « Recherches », et on
 * doit pouvoir annuler même après avoir touché « Accueil ». S'il vivait dans
 * `SearchesScreen`, il disparaîtrait avec lui — alors que la suppression, elle,
 * continuerait son compte à rebours dans le store.
 *
 * POURQUOI IL NE PORTE AUCUNE MINUTERIE. Le `toast` du socle sait s'effacer
 * seul, et il met sa minuterie en pause au survol et au focus (WCAG 2.2.1).
 * C'est une bonne chose pour un message, une très mauvaise pour un délai de
 * grâce : le store, lui, ne se met pas en pause, et on afficherait un
 * « Annuler » qui n'annule plus rien. On passe donc `duration: 0` — le socle ne
 * décide jamais de la fin — et ce composant se contente de refléter
 * `pendingDeletions` : une entrée fait apparaître le message, sa sortie le
 * retire, qu'elle vienne d'un clic sur « Annuler » ou de l'expiration.
 *
 * Le `toast` du socle (4.x) n'a pas d'action : `ToastOptions` porte `tone`,
 * `duration` et `id`, rien de plus. Mais son message est un `ReactNode` — le
 * bouton est donc posé ici, dans l'app, sans toucher au socle.
 */
import { useEffect, useRef } from 'react';
import { Undo2 } from 'lucide-react';
import { useToast } from '@mister-guiiug/dev-pwa-config/react/toast';
import { useAppStore } from '../../store/useAppStore';

export function UndoDeleteToasts() {
  const pendingDeletions = useAppStore(s => s.pendingDeletions);
  const searches = useAppStore(s => s.data.searches);
  const undoDeleteSearch = useAppStore(s => s.undoDeleteSearch);
  const toast = useToast();
  // searchId → toastId. Une ref, pas un état : ce n'est pas ce qui décide du
  // rendu, c'est le journal de ce qui est déjà affiché.
  const shown = useRef(new Map<string, string>());

  useEffect(() => {
    for (const id of pendingDeletions) {
      if (shown.current.has(id)) continue;
      const name = searches.find(s => s.id === id)?.name;
      const toastId = toast.show(
        <span className="undo-toast">
          <span>
            {name ? <>« {name} » supprimée</> : 'Recherche supprimée'}
          </span>
          <button
            type="button"
            className="btn"
            onClick={() => undoDeleteSearch(id)}
          >
            <Undo2 size={15} aria-hidden /> Annuler
          </button>
        </span>,
        // `id` stable : supprimer deux fois la même recherche remplace le
        // message au lieu d'en empiler un second.
        { duration: 0, id: `undo-search-${id}` }
      );
      if (toastId) shown.current.set(id, toastId);
    }

    for (const [id, toastId] of shown.current) {
      if (pendingDeletions.includes(id)) continue;
      toast.dismiss(toastId);
      shown.current.delete(id);
    }
  }, [pendingDeletions, searches, toast, undoDeleteSearch]);

  return null;
}
