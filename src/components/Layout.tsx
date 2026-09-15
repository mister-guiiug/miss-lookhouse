import { Outlet, useLocation } from 'react-router-dom';
import { Telescope } from 'lucide-react';
import { ConsentBanner } from '@mister-guiiug/dev-pwa-config/react/consent-banner';
import { usePageViews } from '@mister-guiiug/dev-pwa-config/react/use-page-views';
import { ThemeToggle } from '@mister-guiiug/dev-pwa-config/react/theme-toggle';
import { BottomNav } from './BottomNav';
import { Footer } from './Footer';
import { HeaderMenu } from './HeaderMenu';

export function Layout() {
  const { pathname } = useLocation();

  /*
   * UNE VUE DE PAGE PAR NAVIGATION. GA4 n'en envoie qu'une par chargement de
   * document : sous `HashRouter`, toute la navigation de l'app serait invisible
   * et la durée de session fausse. Le hook ne fait rien tant que le
   * consentement n'est pas accordé — il se monte donc sans condition.
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
        {/*
          EN FLUX, au-dessus du pied de page : une `region`, pas une boîte
          modale — elle ne recouvre rien et ne piège pas le focus. Ne rend RIEN
          tant que `VITE_GA_MEASUREMENT_ID` n'est pas posée sur le dépôt : sans
          identifiant il n'y a rien à mesurer, donc rien à demander.
        */}
        <ConsentBanner
          gaMeasurementId={import.meta.env.VITE_GA_MEASUREMENT_ID}
        />
        <Footer />
      </main>
      <BottomNav />
    </div>
  );
}
