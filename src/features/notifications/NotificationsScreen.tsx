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
import { useAppStore } from '../../store/useAppStore';
import { timeAgo } from '../../lib/format';
import type { LhNotificationType } from '../../store/types';

const ICON: Record<LhNotificationType, typeof BellRing> = {
  new_listing: Sparkles,
  price_drop: ArrowDownRight,
  recycled: RefreshCw,
  important_change: BellRing,
  probable_duplicate: Copy,
  suspicious: ShieldAlert,
  digest: BellRing,
};

export function NotificationsScreen() {
  const notifications = useAppStore(s => s.data.notifications);
  const markRead = useAppStore(s => s.markNotificationRead);
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

      {sorted.length === 0 ? (
        <div className="empty">Aucune notification.</div>
      ) : (
        sorted.map(n => {
          const Icon = ICON[n.type] ?? BellRing;
          const body = (
            <div
              className="card"
              style={{
                borderLeft: `3px solid ${n.readAt ? 'var(--border)' : 'var(--primary)'}`,
                opacity: n.readAt ? 0.75 : 1,
              }}
            >
              <div
                className="row"
                style={{ alignItems: 'flex-start', gap: '0.5rem' }}
              >
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
                </div>
              </div>
            </div>
          );
          return n.listingId ? (
            <Link
              key={n.id}
              to={`/annonces/${n.listingId}`}
              className="card-link"
              onClick={() => markRead(n.id)}
            >
              {body}
            </Link>
          ) : (
            <div
              key={n.id}
              onClick={() => markRead(n.id)}
              role="button"
              tabIndex={0}
            >
              {body}
            </div>
          );
        })
      )}
    </>
  );
}
