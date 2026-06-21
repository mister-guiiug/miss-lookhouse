import { Download, LogOut, Mail, RotateCcw, Send } from 'lucide-react';
import { PushToggle } from './PushToggle';
import { useAppStore } from '../../store/useAppStore';
import { BACKEND, IS_SUPABASE } from '../../backend/config';
import { useAuth } from '../../auth/useAuth';
import { REPO_URL, SPONSOR_URL } from '../../links';

declare const __APP_VERSION__: string;

export function SettingsScreen() {
  const theme = useAppStore(s => s.theme);
  const setTheme = useAppStore(s => s.setTheme);
  const data = useAppStore(s => s.data);
  const resetDemo = useAppStore(s => s.resetDemo);
  const { user, signOut } = useAuth();

  const exportJson = () => {
    const blob = new Blob([JSON.stringify({ v: 1, data }, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'miss-lookhouse-export.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <h2 className="section-title">Apparence</h2>
      <div className="card">
        <div className="row">
          {(['light', 'dark'] as const).map(t => (
            <button
              key={t}
              className={`btn ${theme === t ? 'btn-primary' : ''}`}
              onClick={() => setTheme(t)}
            >
              {t === 'light' ? 'Clair' : 'Sombre'}
            </button>
          ))}
        </div>
      </div>

      <h2 className="section-title">Notifications</h2>
      <div className="card">
        <p className="muted" style={{ marginTop: 0, fontSize: '0.84rem' }}>
          Canaux configurables. Le Web Push et l’email nécessitent le backend
          Supabase (clé VAPID publique + Edge Function). En mode démo, les
          alertes restent <strong>in-app</strong>.
        </p>
        <PushToggle />
        <div className="row spread" style={{ marginTop: '0.4rem' }}>
          <span className="row">
            <Mail size={16} aria-hidden /> E-mail (résumé)
          </span>
          <span className="badge badge-muted">
            {BACKEND === 'supabase' ? 'disponible' : 'backend requis'}
          </span>
        </div>
        <div className="row spread" style={{ marginTop: '0.4rem' }}>
          <span className="row">
            <Send size={16} aria-hidden /> Webhook (Telegram/Slack)
          </span>
          <span className="badge badge-muted">optionnel</span>
        </div>
      </div>

      <h2 className="section-title">Mes données (RGPD)</h2>
      <div className="card">
        <p className="muted" style={{ marginTop: 0, fontSize: '0.84rem' }}>
          En mode démo, vos données restent <strong>dans ce navigateur</strong>.
          Vous pouvez les exporter ou les réinitialiser à tout moment.
        </p>
        <div className="row">
          <button className="btn" onClick={exportJson}>
            <Download size={16} aria-hidden /> Exporter (JSON)
          </button>
          <button
            className="btn"
            onClick={() => {
              if (
                window.confirm('Réinitialiser les données (retour à la démo) ?')
              )
                resetDemo();
            }}
          >
            <RotateCcw size={16} aria-hidden /> Réinitialiser
          </button>
        </div>
      </div>

      {IS_SUPABASE && user && (
        <>
          <h2 className="section-title">Compte</h2>
          <div className="card">
            <div className="row spread">
              <span className="muted" style={{ fontSize: '0.85rem' }}>
                Connecté : {user.email}
              </span>
              <button className="btn" onClick={() => void signOut()}>
                <LogOut size={16} aria-hidden /> Se déconnecter
              </button>
            </div>
          </div>
        </>
      )}

      <h2 className="section-title">À propos</h2>
      <div className="card">
        <div className="row spread">
          <span>Version</span>
          <span className="muted">
            {typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev'}
          </span>
        </div>
        <div className="row spread" style={{ marginTop: '0.3rem' }}>
          <span>Backend</span>
          <span className="badge badge-muted">{BACKEND}</span>
        </div>
        <div className="row" style={{ marginTop: '0.6rem' }}>
          <a
            className="btn"
            href={REPO_URL}
            target="_blank"
            rel="noopener noreferrer"
          >
            Code source
          </a>
          <a
            className="btn"
            href={SPONSOR_URL}
            target="_blank"
            rel="noopener noreferrer"
          >
            Soutenir
          </a>
        </div>
      </div>
    </>
  );
}
