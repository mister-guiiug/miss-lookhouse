import { useEffect, useState } from 'react';
import { Smartphone } from 'lucide-react';
import {
  pushSupported,
  getPushSubscription,
  enablePush,
  disablePush,
} from '../../push/webpush';

/** Ligne « Push web » des réglages : activer/désactiver l'abonnement Web Push. */
export function PushToggle() {
  const supported = pushSupported();
  const [on, setOn] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!supported) return;
    getPushSubscription()
      .then(s => setOn(Boolean(s)))
      .catch(() => setOn(false));
  }, [supported]);

  const label = (
    <span className="row">
      <Smartphone size={16} aria-hidden /> Push web (PWA)
    </span>
  );

  if (!supported) {
    return (
      <div className="row spread">
        {label}
        <span className="badge badge-muted">backend requis</span>
      </div>
    );
  }

  const toggle = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const res = on ? await disablePush() : await enablePush();
      if (res.ok) setOn(!on);
      else setMsg(res.error ?? 'Échec.');
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Échec.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="row spread">
        {label}
        <button
          className={`btn ${on ? '' : 'btn-primary'}`}
          onClick={() => void toggle()}
          disabled={busy || on == null}
        >
          {busy ? '…' : on ? 'Désactiver' : 'Activer'}
        </button>
      </div>
      {msg && (
        <span style={{ fontSize: '0.78rem', color: 'var(--danger)' }}>
          {msg}
        </span>
      )}
    </>
  );
}
