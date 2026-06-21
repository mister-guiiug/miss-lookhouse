import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAppStore } from '../../store/useAppStore';
import { formatPrice, pricePerM2, timeAgo } from '../../lib/format';
import {
  ScoreBadge,
  SourceBadge,
  StatusBadge,
  Sparkline,
} from '../../components/ui';
import type { UserStatus } from '../../store/types';

type SortKey = 'recent' | 'relevance' | 'price_asc' | 'price_desc';

export function ListingsScreen() {
  const listings = useAppStore(s => s.data.listings);
  const statuses = useAppStore(s => s.data.statuses);

  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<UserStatus | ''>('');
  const [sort, setSort] = useState<SortKey>('recent');

  // Filtre + tri DANS le composant (jamais dans un sélecteur Zustand).
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    let arr = listings.filter(l => {
      if (q && !`${l.title ?? ''} ${l.city ?? ''}`.toLowerCase().includes(q))
        return false;
      if (statusFilter && statuses[l.id]?.status !== statusFilter) return false;
      return true;
    });
    arr = [...arr].sort((a, b) => {
      switch (sort) {
        case 'relevance':
          return (b.relevanceScore ?? 0) - (a.relevanceScore ?? 0);
        case 'price_asc':
          return (a.price ?? Infinity) - (b.price ?? Infinity);
        case 'price_desc':
          return (b.price ?? -Infinity) - (a.price ?? -Infinity);
        default:
          return b.lastChangedAt.localeCompare(a.lastChangedAt);
      }
    });
    return arr;
  }, [listings, statuses, query, statusFilter, sort]);

  return (
    <>
      <input
        value={query}
        onChange={e => setQuery(e.target.value)}
        placeholder="Rechercher (titre, ville)…"
        aria-label="Filtrer les annonces"
      />
      <div className="row" style={{ gap: '0.5rem' }}>
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value as UserStatus | '')}
          style={{ flex: 1 }}
          aria-label="Filtrer par statut"
        >
          <option value="">Tous les statuts</option>
          <option value="a_revoir">À revoir</option>
          <option value="interessante">Intéressante</option>
          <option value="verifiee">Vérifiée</option>
          <option value="suspecte">Suspecte</option>
          <option value="visitee">Visitée</option>
          <option value="rejetee">Rejetée</option>
        </select>
        <select
          value={sort}
          onChange={e => setSort(e.target.value as SortKey)}
          style={{ flex: 1 }}
          aria-label="Trier"
        >
          <option value="recent">Plus récentes</option>
          <option value="relevance">Pertinence</option>
          <option value="price_asc">Prix croissant</option>
          <option value="price_desc">Prix décroissant</option>
        </select>
      </div>

      <div className="muted" style={{ fontSize: '0.8rem' }}>
        {visible.length} annonce(s)
      </div>

      {visible.length === 0 ? (
        <div className="empty">Aucune annonce ne correspond.</div>
      ) : (
        visible.map(l => {
          const st = statuses[l.id];
          return (
            <Link
              key={l.id}
              to={`/annonces/${l.id}`}
              className="card card-link"
            >
              <div className="row spread">
                <p className="h-title">{l.title ?? 'Annonce sans titre'}</p>
                <span className="price">{formatPrice(l.price)}</span>
              </div>
              <div
                className="muted"
                style={{ fontSize: '0.8rem', marginTop: '0.2rem' }}
              >
                {[
                  l.city,
                  l.surfaceM2 ? `${l.surfaceM2} m²` : null,
                  l.rooms ? `${l.rooms} p.` : null,
                  pricePerM2(l.price, l.surfaceM2),
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </div>
              {l.priceHistory.length > 1 && (
                <Sparkline points={l.priceHistory} />
              )}
              <div className="row" style={{ marginTop: '0.4rem' }}>
                <SourceBadge sourceId={l.sourceId} />
                <ScoreBadge score={l.relevanceScore} label="Pert." />
                {st && <StatusBadge status={st.status} />}
                <span
                  className="muted"
                  style={{ fontSize: '0.76rem', marginLeft: 'auto' }}
                >
                  {timeAgo(l.lastChangedAt)}
                </span>
              </div>
            </Link>
          );
        })
      )}
    </>
  );
}
