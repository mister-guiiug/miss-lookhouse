import { Sparkles } from 'lucide-react';
import { IS_SUPABASE } from '../../backend/config';
import { useEmbeddingPreference } from '../similar/embeddingPreference';

/**
 * Réglage « Similarité par embeddings » — désactivé par défaut.
 *
 * EN MODE LOCAL, GRISÉ ET EXPLIQUÉ plutôt que caché : le réglage existe, il
 * dépend du serveur, et le dire vaut mieux que de le laisser chercher.
 * `aria-disabled` et non `disabled` — la règle du socle (`use-action-guard`) :
 * l'interrupteur reste atteignable au clavier, et sa description dit pourquoi
 * il ne bascule pas. Les chiffres affichés (modèle, poids) sont ceux du moteur
 * (`src/domain/embedding.ts`) ; le texte les reprend en clair.
 */
export function EmbeddingToggle() {
  const enabled = useEmbeddingPreference(s => s.enabled);
  const setEnabled = useEmbeddingPreference(s => s.setEnabled);
  const on = IS_SUPABASE && enabled;

  return (
    <>
      <div className="row spread">
        <span className="row" id="embeddings-label">
          <Sparkles size={16} aria-hidden /> Similarité par embeddings
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-labelledby="embeddings-label"
          aria-describedby="embeddings-desc"
          aria-disabled={IS_SUPABASE ? undefined : true}
          className={`badge ${on ? 'badge-ok' : 'badge-muted'}`}
          onClick={() => {
            if (IS_SUPABASE) setEnabled(!enabled);
          }}
        >
          {on ? 'Activée' : 'Désactivée'}
        </button>
      </div>
      <p
        id="embeddings-desc"
        className="muted"
        style={{ fontSize: '0.8rem', margin: '0.4rem 0 0' }}
      >
        {IS_SUPABASE ? (
          <>
            Ajoute aux signaux de l’heuristique la proximité des textes calculée
            sur le serveur (modèle gte-small), avec un poids de 0,2 face aux
            autres facteurs réunis. Sur la fiche d’une annonce, chaque
            rapprochement dit alors d’où il vient. Le modèle est entraîné
            surtout sur l’anglais : il repère bien les annonces recopiées ou
            republiées, pas les reformulations d’un texte français.
          </>
        ) : (
          <>
            Indisponible en mode démo local : les embeddings sont calculés et
            rangés sur le serveur, en mode compte.
          </>
        )}
      </p>
    </>
  );
}
