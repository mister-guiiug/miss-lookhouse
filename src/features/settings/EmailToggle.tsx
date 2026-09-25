import { useEffect, useState } from 'react';
import { Mail } from 'lucide-react';
import type { User } from '@supabase/supabase-js';
import { useAuthContext } from '@mister-guiiug/dev-pwa-config/react/auth-provider';
import { useActionGuard } from '@mister-guiiug/dev-pwa-config/react/use-action-guard';
import { IS_SUPABASE } from '../../backend/config';
import {
  getEmailOptIn,
  setEmailOptIn,
} from '../../backend/notificationPreferences';

/**
 * Alertes par E-MAIL — l'opt-in de l'utilisateur (0017). Désactivé tant qu'il
 * ne l'a pas posé lui-même : la base le vaut `false` par défaut.
 *
 * L'ADRESSE N'EST PAS UN CHAMP : c'est celle du compte, affichée pour qu'on
 * sache où les alertes partiront. La fonction `notify` la relit côté serveur
 * et n'écrit qu'à une adresse confirmée.
 *
 * GARDE HORS LIGNE, comme la Zone dangereuse : le choix se range sur le
 * serveur, le basculer sans réseau ferait croire à un réglage qui n'a pas eu
 * lieu.
 */
export function EmailToggle() {
  const { user } = useAuthContext<unknown, User>();
  const userId = user?.id ?? null;
  // Rattaché à l'utilisateur lu : un changement de compte ne montre pas
  // l'état du précédent le temps de la lecture.
  const [lu, setLu] = useState<{ userId: string; on: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const guard = useActionGuard({
    online: true,
    offlineMessage:
      'Indisponible hors ligne — ce choix se range sur le serveur.',
  });

  useEffect(() => {
    if (!IS_SUPABASE || !userId) return;
    let active = true;
    getEmailOptIn(userId)
      .then(on => {
        if (active) setLu({ userId, on });
      })
      .catch(() => {
        // Illisible (hors ligne, serveur) : on l'affiche éteint, le défaut
        // serveur — plutôt qu'un interrupteur bloqué pour toujours.
        if (active) setLu({ userId, on: false });
      });
    return () => {
      active = false;
    };
  }, [userId]);

  const label = (
    <span className="row" id="email-alerts-label">
      <Mail size={16} aria-hidden /> E-mail (à chaque alerte)
    </span>
  );

  if (!IS_SUPABASE || !user) {
    return (
      <div className="row spread">
        {label}
        <span className="badge badge-muted">backend requis</span>
      </div>
    );
  }

  const on = lu?.userId === user.id ? lu.on : null;

  const toggle = async () => {
    if (on == null) return;
    setBusy(true);
    setError(null);
    try {
      await setEmailOptIn(user.id, !on);
      setLu({ userId: user.id, on: !on });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Échec.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="row spread">
        {label}
        <button
          type="button"
          role="switch"
          aria-checked={on === true}
          aria-labelledby="email-alerts-label"
          aria-describedby="email-alerts-desc"
          className={`badge ${on ? 'badge-ok' : 'badge-muted'}`}
          disabled={busy || on == null}
          {...guard.disabledProps}
          title={guard.reason ?? undefined}
          onClick={guard.wrap(() => void toggle())}
        >
          {on == null ? '…' : on ? 'Activé' : 'Désactivé'}
        </button>
      </div>
      <p
        id="email-alerts-desc"
        className="muted"
        style={{ fontSize: '0.78rem', margin: '0.3rem 0 0' }}
      >
        Envoyées à l’adresse du compte ({user.email ?? 'non renseignée'}), une
        fois confirmée. Tant que l’envoi n’est pas configuré sur le serveur, ce
        canal reste simplement ignoré.
      </p>
      {guard.reason && (
        <p role="status" className="muted" style={{ fontSize: '0.78rem' }}>
          {guard.reason}
        </p>
      )}
      {error && (
        <p role="alert" className="danger-text">
          {error}
        </p>
      )}
    </>
  );
}
