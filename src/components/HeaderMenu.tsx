import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Activity, MoreVertical, RefreshCw, Settings } from 'lucide-react';

/**
 * Met à jour le service worker (si présent) puis recharge la page. En dev (pas
 * de SW), se contente de recharger.
 *
 * `getRegistration()` AU SINGULIER, et c'est le point. Les seize apps de la
 * famille sont publiées sous `https://mister-guiiug.github.io/<app>/` — une
 * seule origine. `getRegistrations()` (au pluriel) rend donc les workers des
 * quinze autres apps, et cette fonction leur demandait à toutes de se mettre à
 * jour : du travail réseau qu'aucune n'a demandé, déclenché par un bouton
 * d'ici. `getRegistration()` sans argument rend la registration qui contrôle
 * CETTE page, et elle seule.
 *
 * Le tort restait mesuré — ce code ne désinscrit rien et n'efface aucun cache,
 * contrairement à ce que faisaient le socle et mister-doc. Mais c'est la même
 * confusion : l'origine n'est pas l'application.
 */
async function reloadAndUpdate(): Promise<void> {
  try {
    if ('serviceWorker' in navigator) {
      const registration = await navigator.serviceWorker.getRegistration();
      await registration?.update();
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
              navigate('/traitements');
            }}
          >
            <Activity size={16} aria-hidden /> Traitements
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
