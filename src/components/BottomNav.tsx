import type { ComponentType } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { Home, Search, List, CopyCheck, Bell } from 'lucide-react';
import { BottomNav as DwcBottomNav } from '@mister-guiiug/dev-wpa-config/react/bottom-nav';
import { useAppStore } from '../store/useAppStore';

const items = [
  { href: '/', label: 'Accueil', Icon: Home, end: true },
  { href: '/recherches', label: 'Recherches', Icon: Search, end: false },
  { href: '/annonces', label: 'Annonces', Icon: List, end: false },
  { href: '/similaires', label: 'Doublons', Icon: CopyCheck, end: false },
  { href: '/notifications', label: 'Alertes', Icon: Bell, end: false },
];

/**
 * Barre de navigation basse, déléguée au socle (`react/bottom-nav`) : nom du
 * repère, `aria-current`, trait actif et pastille lue (« n non lues ») viennent
 * de là. `currentPath` est indispensable : sous HashRouter, le
 * `location.pathname` global (défaut du socle) ne voit pas la route.
 */
export function BottomNav() {
  const notifications = useAppStore(s => s.data.notifications);
  const unread = notifications.filter(n => !n.readAt).length;
  const { pathname } = useLocation();

  return (
    <DwcBottomNav
      currentPath={pathname}
      items={items.map(({ href, label, Icon, end }) => ({
        href,
        label,
        end,
        icon: <Icon size={20} aria-hidden="true" />,
        ...(href === '/notifications' && unread > 0
          ? { badge: unread, badgeLabel: `${unread} non lues` }
          : {}),
      }))}
      // `linkComponent` est typé `ComponentType<Record<string, unknown>>`, qui
      // refuse un composant à prop obligatoire — donc `NavLink` et son `to`,
      // alors que c'est l'usage documenté du socle. La conversion est sûre :
      // `hrefProp` fournit précisément `to`. Même motif que miss-genius.
      linkComponent={
        NavLink as unknown as ComponentType<Record<string, unknown>>
      }
      hrefProp="to"
    />
  );
}
