import { Download, LogOut, RotateCcw, Rss, Send } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { User } from '@supabase/supabase-js';
import { useThemeContext } from '@mister-guiiug/dev-pwa-config/react/theme-provider';
import { useAuthContext } from '@mister-guiiug/dev-pwa-config/react/auth-provider';
import { PushToggle } from './PushToggle';
import { EmailToggle } from './EmailToggle';
import { EmbeddingToggle } from './EmbeddingToggle';
import { DangerZone } from './DangerZone';
import { useAppStore } from '../../store/useAppStore';
import { BACKEND, IS_SUPABASE } from '../../backend/config';
import { Footer } from '../../components/Footer';

/** Le troisième choix est neuf : l'ancien sélecteur n'avait que clair/sombre. */
const THEMES = [
  ['light', 'Clair'],
  ['dark', 'Sombre'],
  ['system', 'Système'],
] as const;

export function SettingsScreen() {
  // `useThemeContext`, PAS `useTheme` : le hook monterait une seconde instance,
  // qui écrirait `data-theme` en concurrence de celle du fournisseur.
  const themeState = useThemeContext();
  const data = useAppStore(s => s.data);
  const resetDemo = useAppStore(s => s.resetDemo);
  const { user, signOut } = useAuthContext<unknown, User>();

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
          {THEMES.map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={themeState?.theme === value}
              className={`btn ${themeState?.theme === value ? 'btn-primary' : ''}`}
              onClick={() => themeState?.setTheme(value)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <h2 className="section-title">Notifications</h2>
      <div className="card">
        <p className="muted" style={{ marginTop: 0, fontSize: '0.84rem' }}>
          Canaux configurables. Le Web Push et l’e-mail nécessitent le backend
          Supabase (la fonction d’envoi et ses secrets, côté serveur). En mode
          démo, les alertes restent <strong>in-app</strong>.
        </p>
        <PushToggle />
        <div style={{ marginTop: '0.6rem' }}>
          <EmailToggle />
        </div>
        <div className="row spread" style={{ marginTop: '0.4rem' }}>
          <span className="row">
            <Send size={16} aria-hidden /> Webhook (Telegram/Slack)
          </span>
          <span className="badge badge-muted">optionnel</span>
        </div>
      </div>

      <h2 className="section-title">Doublons et rapprochements</h2>
      <div className="card">
        <EmbeddingToggle />
      </div>

      {IS_SUPABASE && user && (
        <>
          <h2 className="section-title">Collecte automatique</h2>
          <div className="card">
            <p className="muted" style={{ marginTop: 0, fontSize: '0.84rem' }}>
              Configurez des connecteurs d’<strong>API / flux autorisés</strong>{' '}
              pour collecter automatiquement (toutes les heures), de façon
              responsable. Aucun scraping de portail.
            </p>
            <Link to="/connecteurs" className="btn">
              <Rss size={16} aria-hidden /> Gérer les connecteurs
            </Link>
          </div>
        </>
      )}

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
          <span>Backend</span>
          <span className="badge badge-muted">{BACKEND}</span>
        </div>
        {/* Le code source et le soutien ne sont plus ici en boutons : le pied
            de page, en bas de l'écran, les porte avec la version et le
            signalement — les mêmes que sur l'accueil. */}
      </div>

      {/* EN DERNIER, et séparée du reste : on ne tombe pas dessus en cherchant
          autre chose. Elle ne s'affiche qu'avec un compte — en mode local il
          n'y en a pas, et « Réinitialiser » efface déjà tout. */}
      <DangerZone />

      {/* Le code source, le soutien et le signalement : ici et sur l'accueil,
          nulle part ailleurs (règle famille du 06/09/2026). */}
      <Footer />
    </>
  );
}
