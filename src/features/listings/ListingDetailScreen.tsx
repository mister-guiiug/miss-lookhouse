import { useMemo, useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, ExternalLink } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { formatDate, formatPrice, nowMs, pricePerM2 } from '../../lib/format';
import {
  BucketBadge,
  ScoreBadge,
  Sparkline,
  STATUS_META,
} from '../../components/ui';
import { freshnessScore } from '../../domain/scoring';
import { summarizePriceSeries } from '../../domain/priceHistory';
import type { UserStatus } from '../../store/types';
import { VerificationCard } from './VerificationCard';

const QUICK_TAGS = ['à visiter', 'négociable', 'lumineux', 'travaux', 'rare'];

export function ListingDetailScreen() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const listings = useAppStore(s => s.data.listings);
  const statuses = useAppStore(s => s.data.statuses);
  const notesMap = useAppStore(s => s.data.notes);
  const similarities = useAppStore(s => s.data.similarities);
  const setStatus = useAppStore(s => s.setStatus);
  const toggleTag = useAppStore(s => s.toggleTag);
  const addNote = useAppStore(s => s.addNote);

  const [noteDraft, setNoteDraft] = useState('');

  const listing = listings.find(l => l.id === id);
  const byId = useMemo(() => new Map(listings.map(l => [l.id, l])), [listings]);

  if (!listing) {
    return (
      <div className="empty">
        Annonce introuvable. <Link to="/annonces">Retour</Link>
      </div>
    );
  }

  const st = statuses[listing.id];
  const notes = notesMap[listing.id] ?? [];
  const fresh = freshnessScore(Date.parse(listing.lastChangedAt), nowMs());
  const priceSummary = summarizePriceSeries(listing.priceHistory);

  const similar = similarities
    .filter(s => s.aId === listing.id || s.bId === listing.id)
    .map(s => {
      const otherId = s.aId === listing.id ? s.bId : s.aId;
      return { sim: s, other: byId.get(otherId) };
    })
    .filter(x => x.other);

  return (
    <>
      <button
        className="btn"
        onClick={() => navigate(-1)}
        style={{ alignSelf: 'flex-start', padding: '0.35rem 0.6rem' }}
      >
        <ArrowLeft size={16} aria-hidden /> Retour
      </button>

      <div className="card">
        <div className="row spread">
          <span className="badge badge-muted">{listing.sourceId}</span>
          <span
            className={`badge ${listing.sourceStatus === 'active' ? 'badge-ok' : 'badge-muted'}`}
          >
            {listing.sourceStatus}
          </span>
        </div>
        <h2
          className="h-title"
          style={{ fontSize: '1.1rem', marginTop: '0.5rem' }}
        >
          {listing.title ?? 'Annonce sans titre'}
        </h2>
        <div className="row spread" style={{ marginTop: '0.3rem' }}>
          <span className="price" style={{ fontSize: '1.5rem' }}>
            {formatPrice(listing.price)}
          </span>
          <span className="muted">
            {pricePerM2(listing.price, listing.surfaceM2)}
          </span>
        </div>
        <div
          className="muted"
          style={{ fontSize: '0.85rem', marginTop: '0.3rem' }}
        >
          {[
            listing.city,
            listing.postalCode,
            listing.surfaceM2 ? `${listing.surfaceM2} m²` : null,
            listing.rooms ? `${listing.rooms} pièces` : null,
            listing.dpe ? `DPE ${listing.dpe}` : null,
          ]
            .filter(Boolean)
            .join(' · ')}
        </div>
        <div className="row" style={{ marginTop: '0.5rem' }}>
          <ScoreBadge score={listing.relevanceScore} label="Pertinence" />
          <ScoreBadge score={fresh} label="Fraîcheur" />
          {listing.isPro != null && (
            <span className="badge badge-muted">
              {listing.isPro ? 'Agence' : 'Particulier'}
            </span>
          )}
        </div>
        {listing.url && (
          <a
            href={listing.url}
            target="_blank"
            rel="noopener noreferrer"
            className="btn"
            style={{ marginTop: '0.7rem' }}
          >
            <ExternalLink size={15} aria-hidden /> Voir l’annonce source
          </a>
        )}
        {listing.description && (
          <p
            className="muted"
            style={{ fontSize: '0.88rem', marginTop: '0.7rem' }}
          >
            {listing.description}
          </p>
        )}
      </div>

      {/* Qualification */}
      <div className="card">
        <h3 className="section-title">Statut</h3>
        <div className="row" style={{ marginTop: '0.4rem' }}>
          {(Object.keys(STATUS_META) as UserStatus[]).map(s => (
            <button
              key={s}
              type="button"
              className={`badge ${st?.status === s ? STATUS_META[s].cls : 'badge-muted'}`}
              onClick={() => setStatus(listing.id, s)}
            >
              {STATUS_META[s].label}
            </button>
          ))}
        </div>
        <h3 className="section-title" style={{ marginTop: '0.8rem' }}>
          Tags
        </h3>
        <div className="row" style={{ marginTop: '0.4rem' }}>
          {QUICK_TAGS.map(t => (
            <button
              key={t}
              type="button"
              className={`badge ${st?.tags.includes(t) ? 'badge-primary' : 'badge-muted'}`}
              onClick={() => toggleTag(listing.id, t)}
            >
              #{t}
            </button>
          ))}
        </div>
      </div>

      {/* Historique de prix */}
      {listing.priceHistory.length > 0 && (
        <div className="card">
          <h3 className="section-title">Évolution du prix</h3>
          {listing.priceHistory.length > 1 ? (
            <>
              <Sparkline points={listing.priceHistory} />
              <div className="row spread muted" style={{ fontSize: '0.8rem' }}>
                <span>Initial : {formatPrice(priceSummary.first)}</span>
                <span>
                  Actuel : {formatPrice(priceSummary.last)}{' '}
                  {priceSummary.changePct != null && (
                    <strong
                      style={{
                        color:
                          priceSummary.direction === 'down'
                            ? 'var(--ok)'
                            : 'var(--text)',
                      }}
                    >
                      ({priceSummary.changePct} %)
                    </strong>
                  )}
                </span>
              </div>
            </>
          ) : (
            <p className="muted" style={{ fontSize: '0.85rem', margin: 0 }}>
              Un seul relevé : {formatPrice(priceSummary.first)}.
            </p>
          )}
        </div>
      )}

      {/* Similaires / doublons */}
      {similar.length > 0 && (
        <div className="card">
          <h3 className="section-title">Annonces similaires / recyclées</h3>
          {similar.map(({ sim, other }) =>
            other ? (
              <Link
                key={sim.id}
                to={`/annonces/${other.id}`}
                className="card card-link"
                style={{ marginTop: '0.5rem' }}
              >
                <div className="row spread">
                  <span className="h-title" style={{ fontSize: '0.9rem' }}>
                    {other.title ?? 'Annonce'}
                  </span>
                  <BucketBadge bucket={sim.bucket} />
                </div>
                <div className="muted" style={{ fontSize: '0.8rem' }}>
                  Similarité {sim.score}/100 · {other.sourceId} ·{' '}
                  {formatPrice(other.price)}
                </div>
              </Link>
            ) : null
          )}
        </div>
      )}

      {/* Vérification métier */}
      <VerificationCard listingId={listing.id} />

      {/* Notes */}
      <div className="card">
        <h3 className="section-title">Notes privées</h3>
        <textarea
          rows={2}
          value={noteDraft}
          onChange={e => setNoteDraft(e.target.value)}
          placeholder="Ajouter une note…"
          style={{ marginTop: '0.4rem' }}
        />
        <button
          className="btn btn-primary"
          style={{ marginTop: '0.4rem' }}
          onClick={() => {
            addNote(listing.id, noteDraft);
            setNoteDraft('');
          }}
          disabled={!noteDraft.trim()}
        >
          Ajouter
        </button>
        {notes.map(n => (
          <div
            key={n.id}
            className="card"
            style={{ marginTop: '0.5rem', background: 'var(--surface-2)' }}
          >
            <p style={{ margin: 0, fontSize: '0.88rem' }}>{n.body}</p>
            <span className="muted" style={{ fontSize: '0.74rem' }}>
              {formatDate(n.createdAt)}
            </span>
          </div>
        ))}
      </div>

      <div
        className="muted"
        style={{ fontSize: '0.76rem', textAlign: 'center' }}
      >
        Première détection {formatDate(listing.firstSeenAt)} · dernière{' '}
        {formatDate(listing.lastSeenAt)}
      </div>
    </>
  );
}
