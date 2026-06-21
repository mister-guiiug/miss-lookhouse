import { Outlet } from 'react-router-dom';
import { Telescope } from 'lucide-react';
import { BottomNav } from './BottomNav';
import { Footer } from './Footer';
import { ThemeToggle } from './ThemeToggle';

export function Layout() {
  return (
    <div className="app-shell">
      <header className="app-header">
        <h1>
          <Telescope size={20} color="var(--primary)" aria-hidden />
          Miss LookHouse
        </h1>
        <div style={{ marginLeft: 'auto' }}>
          <ThemeToggle />
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
