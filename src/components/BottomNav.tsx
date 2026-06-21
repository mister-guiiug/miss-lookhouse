import { NavLink } from 'react-router-dom';
import { Home, Search, List, CopyCheck, Bell } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';

const items = [
  { to: '/', label: 'Accueil', Icon: Home, end: true },
  { to: '/recherches', label: 'Recherches', Icon: Search, end: false },
  { to: '/annonces', label: 'Annonces', Icon: List, end: false },
  { to: '/similaires', label: 'Doublons', Icon: CopyCheck, end: false },
  { to: '/notifications', label: 'Alertes', Icon: Bell, end: false },
];

export function BottomNav() {
  const notifications = useAppStore(s => s.data.notifications);
  const unread = notifications.filter(n => !n.readAt).length;

  return (
    <nav className="bottom-nav" aria-label="Navigation principale">
      {items.map(({ to, label, Icon, end }) => (
        <NavLink key={to} to={to} end={end}>
          <span style={{ position: 'relative' }}>
            <Icon size={20} aria-hidden />
            {to === '/notifications' && unread > 0 && (
              <span
                aria-label={`${unread} non lues`}
                style={{
                  position: 'absolute',
                  top: -4,
                  right: -8,
                  background: 'var(--danger)',
                  color: '#fff',
                  borderRadius: 999,
                  fontSize: 9,
                  padding: '0 4px',
                  fontWeight: 700,
                }}
              >
                {unread}
              </span>
            )}
          </span>
          {label}
        </NavLink>
      ))}
    </nav>
  );
}
