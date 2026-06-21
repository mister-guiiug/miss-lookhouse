import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MoreVertical, RefreshCw, Settings } from 'lucide-react';

/**
 * Met à jour le service worker (si présent) puis recharge la page. En dev (pas
 * de SW), se contente de recharger.
 */
async function reloadAndUpdate(): Promise<void> {
  try {
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map(r => r.update()));
    }
  } catch {
    /* ignore : on recharge quand même */
  }
  window.location.reload();
}

/** Menu d'en-tête : accès aux paramètres, version, recharger / mettre à jour. */
export function HeaderMenu() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node))
        setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const version =
    typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev';
  const build = typeof __APP_BUILD_ID__ !== 'undefined' ? __APP_BUILD_ID__ : '';

  return (
    <div className="menu" ref={ref}>
      <button
        className="btn"
        style={{ padding: '0.4rem 0.6rem' }}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Menu"
        onClick={() => setOpen(o => !o)}
      >
        <MoreVertical size={18} aria-hidden />
      </button>
      {open && (
        <div className="menu-panel" role="menu">
          <button
            className="menu-item"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              navigate('/reglages');
            }}
          >
            <Settings size={16} aria-hidden /> Paramètres
          </button>
          <button
            className="menu-item"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              void reloadAndUpdate();
            }}
          >
            <RefreshCw size={16} aria-hidden /> Recharger / Mettre à jour
          </button>
          <div className="menu-version">
            Version {version}
            {build ? ` · ${build}` : ''}
          </div>
        </div>
      )}
    </div>
  );
}
