import { Outlet } from 'react-router-dom';
import { Telescope } from 'lucide-react';
import { BottomNav } from './BottomNav';
import { Footer } from './Footer';
import { ThemeToggle } from './ThemeToggle';
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
          <ThemeToggle />
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
