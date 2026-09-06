/**
 * « Zone dangereuse » — supprimer son compte soi-même.
 *
 * POURQUOI CE N'EST PAS UNE ANNULATION. Ailleurs dans cette app on a remplacé
 * la confirmation par l'annulation (supprimer une recherche). Ici c'est
 * l'inverse, et volontairement : l'effacement traverse le réseau, part sur un
 * serveur qui n'a plus rien à rendre, et emporte le compte lui-même. Il n'y a
 * pas de « huit secondes pour changer d'avis » possible. La seule protection
 * qui reste est de rendre le geste DÉLIBÉRÉ — retaper son adresse, pas cliquer
 * « OK ».
 *
 * GARDE HORS LIGNE. `useActionGuard({ online: true })` désactive le bouton et
 * affiche le motif : demander « êtes-vous sûr ? » pour une suppression qui ne
 * peut pas aboutir laisserait l'utilisateur croire son compte effacé alors
 * qu'il ne l'est pas. Le motif est en `role="status"`, il n'est pas seulement
 * dans une infobulle.
 *
 * EN MODE LOCAL, CETTE CARTE N'EXISTE PAS : il n'y a pas de compte, les
 * données ne quittent pas le navigateur, et « Réinitialiser » les efface
 * toutes. Le rendu est conditionné par l'appelant ET par ce composant.
 */
import { useState } from 'react';
import { Trash2, TriangleAlert } from 'lucide-react';
import { useActionGuard } from '@mister-guiiug/dev-pwa-config/react/use-action-guard';
import { useAuth } from '../../auth/useAuth';
import { useAppStore } from '../../store/useAppStore';
import { IS_SUPABASE } from '../../backend/config';
import { deleteMyAccount } from '../../backend/account';
import { clearPersistedQueues } from '../../backend/syncQueue';

export function DangerZone() {
  const { user, signOut } = useAuth();
  const wipeLocal = useAppStore(s => s.wipeLocal);
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const guard = useActionGuard({
    online: true,
    offlineMessage:
      'Indisponible hors ligne — la suppression se fait sur le serveur.',
  });

  if (!IS_SUPABASE || !user) return null;

  const email = user.email ?? '';
  // Comparaison insensible à la casse et aux espaces de bord : on veut un
  // geste conscient, pas un exercice de dactylographie.
  const confirmed =
    email !== '' && typed.trim().toLowerCase() === email.toLowerCase();

  async function handleDelete() {
    setBusy(true);
    setError(null);
    try {
      await deleteMyAccount();
      // Le serveur n'a plus rien : le miroir local et la file d'écritures en
      // attente ne doivent pas lui survivre — elles échoueraient en boucle et
      // laisseraient des données personnelles sur l'appareil.
      clearPersistedQueues();
      wipeLocal();
      await signOut();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Suppression impossible.');
      setBusy(false);
    }
  }

  return (
    <>
      <h2 className="section-title">Zone dangereuse</h2>
      <div className="card danger-zone">
        <p className="row" style={{ marginTop: 0, fontWeight: 600 }}>
          <TriangleAlert size={16} aria-hidden /> Supprimer mon compte
        </p>
        <p className="muted" style={{ fontSize: '0.84rem' }}>
          Efface <strong>définitivement</strong> vos recherches, vos annonces et
          leur historique, vos notes, vos qualifications, vos notifications, vos
          connecteurs, votre journal d’activité et les partages que vous avez
          donnés ou reçus — puis votre compte lui-même. Rien n’est conservé et
          l’opération ne s’annule pas. Pensez à{' '}
          <strong>exporter vos données</strong> avant, si vous voulez les
          garder.
        </p>

        {!open ? (
          <button
            className="btn btn-danger"
            {...guard.disabledProps}
            title={guard.reason ?? undefined}
            onClick={guard.wrap(() => setOpen(true))}
          >
            <Trash2 size={16} aria-hidden /> Supprimer mon compte
          </button>
        ) : (
          <div className="field" style={{ marginTop: '0.6rem' }}>
            <label htmlFor="danger-email">
              Pour confirmer, retapez votre adresse : {email}
            </label>
            <input
              id="danger-email"
              type="email"
              autoComplete="off"
              spellCheck={false}
              value={typed}
              onChange={e => setTyped(e.target.value)}
              aria-describedby="danger-hint"
            />
            <p
              id="danger-hint"
              className="muted"
              style={{ fontSize: '0.78rem', marginTop: '0.3rem' }}
            >
              Le bouton s’active quand l’adresse correspond.
            </p>
            <div className="row" style={{ marginTop: '0.5rem' }}>
              <button
                className="btn"
                disabled={busy}
                onClick={() => {
                  setOpen(false);
                  setTyped('');
                  setError(null);
                }}
              >
                Annuler
              </button>
              <button
                className="btn btn-danger"
                disabled={!confirmed || busy || guard.disabled}
                onClick={() => void handleDelete()}
              >
                <Trash2 size={16} aria-hidden />{' '}
                {busy ? 'Suppression…' : 'Supprimer définitivement'}
              </button>
            </div>
          </div>
        )}

        {guard.reason && (
          <p role="status" className="muted" style={{ fontSize: '0.8rem' }}>
            {guard.reason}
          </p>
        )}
        {error && (
          <p role="alert" className="danger-text">
            {error}
          </p>
        )}
      </div>
    </>
  );
}
