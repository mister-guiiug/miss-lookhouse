import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useAppStore } from '../../store/useAppStore';
import { buildClusters } from '../../domain/clustering';
import type { SimilarityEdge } from '../../domain/clustering';
import { BucketBadge } from '../../components/ui';
import { formatPrice } from '../../lib/format';

export function SimilarScreen() {
  const listings = useAppStore(s => s.data.listings);
  const similarities = useAppStore(s => s.data.similarities);

  const byId = useMemo(() => new Map(listings.map(l => [l.id, l])), [listings]);

  const clusters = useMemo(() => {
    const edges: SimilarityEdge[] = similarities.map(s => ({
      a: s.aId,
      b: s.bId,
      score: s.score,
      bucket: s.bucket,
    }));
    // Seuil 78 = « probablement identique » et au-dessus.
    return buildClusters(edges, 78);
  }, [similarities]);

  return (
    <>
      <h2 className="section-title">Doublons & annonces recyclées</h2>
      <p className="muted" style={{ fontSize: '0.84rem' }}>
        Regroupement par similarité (texte, prix, surface, géo, images). Le
        score et son détail sont explicables — pas de boîte noire.
      </p>

      {clusters.length === 0 ? (
        <div className="empty">Aucun doublon probable détecté.</div>
      ) : (
        clusters.map((c, idx) => (
          <div key={idx} className="card">
            <div className="row spread">
              <span className="h-title">
                Groupe de {c.members.length} annonces
              </span>
              <BucketBadge bucket={c.kind} />
            </div>
            <div
              className="muted"
              style={{ fontSize: '0.78rem', marginBottom: '0.4rem' }}
            >
              Similarité interne max : {c.maxScore}/100
            </div>
            {c.members.map(mid => {
              const l = byId.get(mid);
              if (!l) return null;
              return (
                <Link
                  key={mid}
                  to={`/annonces/${mid}`}
                  className="card card-link"
                  style={{
                    marginTop: '0.4rem',
                    background: 'var(--surface-2)',
                  }}
                >
                  <div className="row spread">
                    <span style={{ fontSize: '0.9rem', fontWeight: 600 }}>
                      {l.title ?? 'Annonce'}
                    </span>
                    <span className="price" style={{ fontSize: '1rem' }}>
                      {formatPrice(l.price)}
                    </span>
                  </div>
                  <span className="muted" style={{ fontSize: '0.76rem' }}>
                    {l.sourceId} · réf. {l.externalId}
                  </span>
                </Link>
              );
            })}
          </div>
        ))
      )}
    </>
  );
}
