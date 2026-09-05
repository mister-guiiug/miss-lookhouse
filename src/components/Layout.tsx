import { Outlet } from 'react-router-dom';
import { Telescope } from 'lucide-react';
import { ThemeToggle } from '@mister-guiiug/dev-pwa-config/react/theme-toggle';
import { BottomNav } from './BottomNav';
import { Footer } from './Footer';
import { HeaderMenu } from './HeaderMenu';

export function Layout() {
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
        <Footer />
      </main>
      <BottomNav />
    </div>
  );
}
