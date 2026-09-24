import { Outlet, useLocation } from 'react-router-dom';
import { Telescope } from 'lucide-react';
import { usePageViews } from '@mister-guiiug/dev-pwa-config/react/use-page-views';
import { ThemeToggle } from '@mister-guiiug/dev-pwa-config/react/theme-toggle';
import { BottomNav } from './BottomNav';
import { HeaderMenu } from './HeaderMenu';

export function Layout() {
  const { pathname } = useLocation();

  /*
   * UNE VUE DE PAGE PAR NAVIGATION — ni zéro, ni deux. Sans ce hook, sous
   * `HashRouter`, toute la navigation de l'app serait invisible et la durée de
   * session fausse ; et si on laissait PostHog compter lui-même, chaque
   * navigation serait comptée DEUX fois. Le socle pose donc
   * `capture_pageview: false`. Le hook ne fait rien tant que le consentement
   * n'est pas accordé — il se monte donc sans condition.
   */
  usePageViews(pathname);

  return (
    <div className="app-shell">
      <header className="app-header">
        <h1>
          <Telescope size={20} color="var(--primary)" aria-hidden />
          Miss LookHouse
        </h1>
        <div className="row" style={{ marginLeft: 'auto', gap: '0.4rem' }}>
          <ThemeToggle className="btn" />
          <HeaderMenu />
        </div>
      </header>
      <main className="app-main">
        <Outlet />
        {/* PAS DE PIED DE PAGE ICI : la règle famille (06/09/2026) le veut sur
            l'accueil et les Réglages seulement — voir DashboardScreen et
            SettingsScreen. */}
      </main>
      <BottomNav />
    </div>
  );
}
