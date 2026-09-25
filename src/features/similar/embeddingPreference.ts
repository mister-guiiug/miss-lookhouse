/**
 * Le réglage « Similarité par embeddings » — DÉSACTIVÉ par défaut.
 *
 * PAR APPAREIL, COMME LE THÈME. C'est une façon de REGARDER les annonces, pas
 * une donnée du compte : rien à synchroniser, rien à effacer avec lui. Il vit
 * donc dans le stockage du navigateur, et le serveur n'en sait rien.
 *
 * SANS EFFET EN MODE LOCAL : les vecteurs sont calculés et rangés sur le
 * serveur (fonction `embed`, migration 0016). L'écran Réglages le montre alors
 * grisé, avec la raison ; `embeddingsActive` le rend inopérant partout ailleurs.
 */
import { create } from 'zustand';

export const EMBEDDINGS_STORAGE_KEY = 'lh_similarite_embeddings';

function read(): boolean {
  try {
    return localStorage.getItem(EMBEDDINGS_STORAGE_KEY) === 'on';
  } catch {
    return false;
  }
}

interface EmbeddingPreferenceState {
  enabled: boolean;
  setEnabled: (enabled: boolean) => void;
}

export const useEmbeddingPreference = create<EmbeddingPreferenceState>()(
  set => ({
    enabled: read(),
    setEnabled: enabled => {
      try {
        localStorage.setItem(EMBEDDINGS_STORAGE_KEY, enabled ? 'on' : 'off');
      } catch {
        /* stockage indisponible : le réglage vaut pour la session */
      }
      set({ enabled });
    },
  })
);

/** Le réglage produit-il un effet ici ? Il faut le mode compte ET le choix. */
export function embeddingsActive(enabled: boolean, isSupabase: boolean) {
  return isSupabase && enabled;
}
