import { Moon, Sun } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';

export function ThemeToggle() {
  const theme = useAppStore(s => s.theme);
  const toggleTheme = useAppStore(s => s.toggleTheme);
  const dark = theme === 'dark';
  return (
    <button
      className="btn"
      onClick={toggleTheme}
      aria-label={dark ? 'Passer en clair' : 'Passer en sombre'}
      style={{ padding: '0.4rem 0.6rem' }}
    >
      {dark ? <Sun size={18} aria-hidden /> : <Moon size={18} aria-hidden />}
    </button>
  );
}
