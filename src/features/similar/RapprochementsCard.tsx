/**
 * « Annonces similaires / recyclées », version heuristique + EMBEDDINGS.
 *
 * CHARGÉE À LA DEMANDE (`React.lazy` dans `ListingDetailScreen`) : seulement
 * en mode compte et réglage actif. Ni ce composant, ni l'appel à la RPC, ni le
 * mélange ne pèsent sur le premier chargement — le réglage est désactivé par
 * défaut, la plupart des visiteurs ne téléchargeront jamais ce morceau.
 *
 * LES EMBEDDINGS VIENNENT APRÈS L'HEURISTIQUE, À L'ÉCRAN AUSSI : pendant que
 * la RPC répond — ou si elle échoue —, les rapprochements de l'heuristique
 * s'affichent déjà, notés par elle seule, et le disent.
 */
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Sparkles } from 'lucide-react';
import { BucketBadge } from '../../components/ui';
import { formatPrice } from '../../lib/format';
import {
  fetchEmbeddingNeighbors,
  type EmbeddingNeighbor,
} from '../../backend/embeddings';
import { origine, pourquoi, rapprocher } from './rapprochement';
import type { LocalListing, LocalSimilarity } from '../../store/types';

interface Props {
  listing: LocalListing;
  edges: readonly LocalSimilarity[];
  byId: ReadonlyMap<string, LocalListing>;
}

/** Réponse de la RPC, rattachée à l'annonce demandée (navigation rapide). */
type Lecture =
  | { listingId: string; neighbors: EmbeddingNeighbor[] }
  | { listingId: string; error: string };

const AUCUN: EmbeddingNeighbor[] = [];

export default function RapprochementsCard({ listing, edges, byId }: Props) {
  const [lecture, setLecture] = useState<Lecture | null>(null);

  useEffect(() => {
    let active = true;
    fetchEmbeddingNeighbors(listing.id)
      .then(neighbors => {
        if (active) setLecture({ listingId: listing.id, neighbors });
      })
      .catch((e: unknown) => {
        if (active)
          setLecture({
            listingId: listing.id,
            error: e instanceof Error ? e.message : 'service indisponible',
          });
      });
    return () => {
      active = false;
    };
  }, [listing.id]);

  const courante = lecture?.listingId === listing.id ? lecture : null;
  const neighbors =
    courante && 'neighbors' in courante ? courante.neighbors : AUCUN;
  const items = useMemo(
    () => rapprocher(listing, edges, neighbors, byId),
    [listing, edges, neighbors, byId]
  );

  return (
    <div className="card">
      <h3 className="section-title">
        <Sparkles size={14} aria-hidden /> Annonces similaires / recyclées
      </h3>
      <p
        className="muted"
        style={{ fontSize: '0.78rem', margin: '0.2rem 0 0' }}
      >
        Heuristique + embeddings (gte-small, poids 0,2 face aux autres
        facteurs). Fiable pour les annonces recopiées ou republiées, pas pour
        juger le sens d’un texte français reformulé.
      </p>

      {!courante && (
        <p role="status" className="muted" style={{ fontSize: '0.8rem' }}>
          Recherche des annonces proches…
        </p>
      )}
      {courante && 'error' in courante && (
        <p role="alert" style={{ fontSize: '0.8rem', color: 'var(--danger)' }}>
          Rapprochement par embeddings indisponible ({courante.error}) : seule
          l’heuristique est affichée.
        </p>
      )}

      {items.length === 0 ? (
        courante && (
          <p className="muted" style={{ fontSize: '0.84rem' }}>
            Aucune annonce proche.
          </p>
        )
      ) : (
        <ul
          aria-label="Annonces rapprochées"
          style={{ listStyle: 'none', margin: 0, padding: 0 }}
        >
          {items.map(r => (
            <li key={r.other.id}>
              <Link
                to={`/annonces/${r.other.id}`}
                className="card card-link"
                style={{ marginTop: '0.5rem' }}
              >
                <div className="row spread">
                  <span className="h-title" style={{ fontSize: '0.9rem' }}>
                    {r.other.title ?? 'Annonce'}
                  </span>
                  <BucketBadge bucket={r.result.bucket} />
                </div>
                <div className="muted" style={{ fontSize: '0.8rem' }}>
                  Similarité {r.result.score}/100 · {r.other.sourceId} ·{' '}
                  {formatPrice(r.other.price)}
                </div>
                <div className="muted" style={{ fontSize: '0.78rem' }}>
                  Pourquoi : {pourquoi(r.result).join(' ; ')}
                </div>
                <span
                  className={`badge ${r.viaEmbeddings ? 'badge-primary' : 'badge-muted'}`}
                  style={{ marginTop: '0.3rem' }}
                >
                  {origine(r)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
