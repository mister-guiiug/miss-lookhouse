import { NavLink, useLocation } from 'react-router-dom';
import { Home, Search, List, CopyCheck, Bell } from 'lucide-react';
import { BottomNav as DwcBottomNav } from '@mister-guiiug/dev-pwa-config/react/bottom-nav';
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
      // Le socle 3.32.0 a élargi `linkComponent` à `ComponentType<any>` :
      // le type refusait jusque-là tout composant à prop OBLIGATOIRE, donc
      // précisément le composant de lien de react-router et son `to` —
      // l'usage que sa propre documentation donne en exemple. Cinq apps
      // portaient la même conversion ; elle n'a plus lieu d'être.
      linkComponent={NavLink}
      hrefProp="to"
    />
  );
}
