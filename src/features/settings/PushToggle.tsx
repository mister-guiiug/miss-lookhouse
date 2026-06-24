import { useEffect, useState } from 'react';
import { Smartphone, Send } from 'lucide-react';
import {
  pushSupported,
  getPushSubscription,
  enablePush,
  disablePush,
  sendTestNotification,
} from '../../push/webpush';
import { getSupabase } from '../../backend/supabaseClient';
import { pullAll } from '../../backend/repository';
import { useAppStore } from '../../store/useAppStore';

/** Ligne « Push web » des réglages : activer/désactiver l'abonnement Web Push. */
export function PushToggle() {
  const supported = pushSupported();
  const [on, setOn] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [testMsg, setTestMsg] = useState<string | null>(null);

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

  const runTest = async () => {
    setTesting(true);
    setTestMsg(null);
    try {
      const res = await sendTestNotification();
      if (!res.ok) {
        setTestMsg(`Échec : ${res.error ?? 'inconnu'}.`);
        return;
      }
      const d = res.dispatch;
      const parts = [
        `push : ${d?.pushSent ?? 0}`,
        `webhook : ${d?.webhookSent ?? 0}`,
      ];
      // Rafraîchit le centre de notifications pour y refléter la notif de test
      // (et son statut de livraison) sans attendre une reconnexion.
      const s = getSupabase();
      if (s) {
        try {
          useAppStore.getState().hydrate(await pullAll(s));
        } catch {
          /* best-effort : la notif apparaîtra au prochain pull */
        }
      }
      setTestMsg(
        `Envoyée ✓ (${parts.join(' · ')}). Détail par canal dans le centre de notifications.`
      );
    } catch (e) {
      setTestMsg(e instanceof Error ? e.message : 'Échec.');
    } finally {
      setTesting(false);
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
      <div className="row spread" style={{ marginTop: '0.4rem' }}>
        <span className="muted" style={{ fontSize: '0.78rem' }}>
          Tester l’envoi (vers les canaux activés)
        </span>
        <button
          className="btn"
          onClick={() => void runTest()}
          disabled={testing}
        >
          <Send size={15} aria-hidden />{' '}
          {testing ? 'Envoi…' : 'Notification test'}
        </button>
      </div>
      {testMsg && (
        <span className="muted" style={{ fontSize: '0.78rem' }}>
          {testMsg}
        </span>
      )}
    </>
  );
}
