import { Link } from 'react-router-dom';
import {
  ArrowDownRight,
  BellRing,
  CheckCheck,
  Copy,
  RefreshCw,
  ShieldAlert,
  Sparkles,
} from 'lucide-react';
import type { MouseEvent as ReactMouseEvent } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { timeAgo } from '../../lib/format';
import { useLongPress } from '../../lib/useLongPress';
import type { LhNotificationType, LocalNotification } from '../../store/types';

const ICON: Record<LhNotificationType, typeof BellRing> = {
  new_listing: Sparkles,
  price_drop: ArrowDownRight,
  recycled: RefreshCw,
  important_change: BellRing,
  probable_duplicate: Copy,
  suspicious: ShieldAlert,
  digest: BellRing,
};

/**
 * Une notification. Clic court = marquer lu (+ ouvrir l'annonce) ;
 * APPUI LONG = repasser en « non lu ».
 */
function NotificationItem({ n }: { n: LocalNotification }) {
  const markRead = useAppStore(s => s.markNotificationRead);
  const markUnread = useAppStore(s => s.markNotificationUnread);
  const press = useLongPress(
    () => markUnread(n.id),
    () => markRead(n.id)
  );
  const Icon = ICON[n.type] ?? BellRing;

  const inner = (
    <div
      className="card"
      style={{
        borderLeft: `3px solid ${n.readAt ? 'var(--border)' : 'var(--primary)'}`,
        opacity: n.readAt ? 0.7 : 1,
      }}
    >
      <div className="row" style={{ alignItems: 'flex-start', gap: '0.5rem' }}>
        <Icon size={18} color="var(--primary)" aria-hidden />
        <div style={{ flex: 1 }}>
          <div className="row spread">
            <strong style={{ fontSize: '0.92rem' }}>{n.title}</strong>
            <span className="muted" style={{ fontSize: '0.74rem' }}>
              {timeAgo(n.createdAt)}
            </span>
          </div>
          <p
            className="muted"
            style={{ margin: '0.2rem 0 0', fontSize: '0.85rem' }}
          >
            {n.body}
          </p>
          {!n.readAt && (
            <span
              className="badge badge-primary"
              style={{ marginTop: '0.4rem' }}
            >
              Non lue
            </span>
          )}
        </div>
      </div>
    </div>
  );

  const common = {
    ...press,
    className: 'notif-item card-link',
    onContextMenu: (e: ReactMouseEvent) => e.preventDefault(),
  };

  return n.listingId ? (
    <Link to={`/annonces/${n.listingId}`} {...common}>
      {inner}
    </Link>
  ) : (
    <div role="button" tabIndex={0} {...common}>
      {inner}
    </div>
  );
}

export function NotificationsScreen() {
  const notifications = useAppStore(s => s.data.notifications);
  const markAllRead = useAppStore(s => s.markAllRead);

  const sorted = [...notifications].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt)
  );

  return (
    <>
      <div className="row spread">
        <h2 className="section-title">Centre de notifications</h2>
        <button
          className="btn"
          style={{ padding: '0.35rem 0.6rem' }}
          onClick={markAllRead}
        >
          <CheckCheck size={15} aria-hidden /> Tout lire
        </button>
      </div>

      {sorted.length > 0 && (
        <p className="muted" style={{ fontSize: '0.78rem', margin: 0 }}>
          Astuce : <strong>appui long</strong> sur une alerte pour la repasser
          en « non lue ».
        </p>
      )}

      {sorted.length === 0 ? (
        <div className="empty">Aucune notification.</div>
      ) : (
        sorted.map(n => <NotificationItem key={n.id} n={n} />)
      )}
    </>
  );
}
