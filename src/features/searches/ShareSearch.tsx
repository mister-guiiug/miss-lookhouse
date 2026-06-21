import { useEffect, useState } from 'react';
import { Share2, Trash2 } from 'lucide-react';
import { IS_SUPABASE } from '../../backend/config';
import {
  listShares,
  shareSearch,
  unshareSearch,
  type Share,
} from '../../backend/sharing';

/**
 * Bloc de partage (lecture) d'une recherche. Visible seulement pour le
 * PROPRIÉTAIRE (on s'appuie sur l'échec de `listShares` — réservé au
 * propriétaire — pour se masquer chez un destinataire) en mode Supabase.
 */
export function ShareSearch({ searchId }: { searchId: string }) {
  const [shares, setShares] = useState<Share[] | null>(null);
  const [owner, setOwner] = useState(true);
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const reload = () => {
    listShares(searchId)
      .then(s => {
        setShares(s);
        setOwner(true);
      })
      .catch(() => setOwner(false));
  };
  useEffect(() => {
    if (IS_SUPABASE) reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchId]);

  if (!IS_SUPABASE || !owner) return null;

  const add = async () => {
    if (!email.trim()) return;
    setBusy(true);
    setMsg(null);
    try {
      await shareSearch(searchId, email);
      setEmail('');
      reload();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Échec du partage.');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (sh: Share) => {
    try {
      await unshareSearch(searchId, sh.sharedWith);
      reload();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Échec.');
    }
  };

  return (
    <div className="card">
      <h3 className="section-title">
        <Share2 size={14} aria-hidden /> Partage (lecture)
      </h3>
      <p className="muted" style={{ fontSize: '0.8rem', marginTop: '0.3rem' }}>
        Partagez cette recherche et ses annonces, en lecture, avec un autre
        compte (par e-mail).
      </p>
      <div className="row" style={{ gap: '0.4rem' }}>
        <input
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          placeholder="email@exemple.fr"
          style={{ flex: 1 }}
        />
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => void add()}
          disabled={busy || !email.trim()}
        >
          {busy ? '…' : 'Partager'}
        </button>
      </div>
      {msg && (
        <span style={{ fontSize: '0.78rem', color: 'var(--danger)' }}>
          {msg}
        </span>
      )}
      {shares && shares.length > 0 && (
        <div style={{ marginTop: '0.5rem' }}>
          {shares.map(sh => (
            <div
              key={sh.sharedWith}
              className="row spread"
              style={{ marginTop: '0.3rem' }}
            >
              <span className="muted" style={{ fontSize: '0.84rem' }}>
                {sh.email}
              </span>
              <button
                type="button"
                className="btn"
                style={{ padding: '0.1rem 0.5rem', fontSize: '0.74rem' }}
                onClick={() => void remove(sh)}
              >
                <Trash2 size={13} aria-hidden /> Révoquer
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
