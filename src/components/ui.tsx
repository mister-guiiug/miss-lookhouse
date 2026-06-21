import type { SimilarityBucket } from '../domain/types';
import type { UserStatus, PricePoint } from '../store/types';

export function ScoreBadge({
  score,
  label,
}: {
  score: number | null | undefined;
  label: string;
}) {
  if (score == null) return null;
  const cls =
    score >= 75 ? 'badge-ok' : score >= 50 ? 'badge-primary' : 'badge-warn';
  return (
    <span className={`badge ${cls}`} title={`${label} ${score}/100`}>
      {label} {score}
    </span>
  );
}

const BUCKET_META: Record<SimilarityBucket, { label: string; cls: string }> = {
  doublon_exact: { label: 'Doublon exact', cls: 'badge-danger' },
  probable_identique: { label: 'Probablement identique', cls: 'badge-warn' },
  similaire: { label: 'Similaire', cls: 'badge-primary' },
  different: { label: 'Différente', cls: 'badge-muted' },
};

export function BucketBadge({ bucket }: { bucket: SimilarityBucket }) {
  const meta = BUCKET_META[bucket];
  return <span className={`badge ${meta.cls}`}>{meta.label}</span>;
}

export const STATUS_META: Record<UserStatus, { label: string; cls: string }> = {
  a_revoir: { label: 'À revoir', cls: 'badge-muted' },
  interessante: { label: 'Intéressante', cls: 'badge-ok' },
  ignoree: { label: 'Ignorée', cls: 'badge-muted' },
  doublon: { label: 'Doublon', cls: 'badge-warn' },
  suspecte: { label: 'Suspecte', cls: 'badge-danger' },
  verifiee: { label: 'Vérifiée', cls: 'badge-ok' },
  visitee: { label: 'Visitée', cls: 'badge-primary' },
  offre_faite: { label: 'Offre faite', cls: 'badge-primary' },
  rejetee: { label: 'Rejetée', cls: 'badge-danger' },
};

export function StatusBadge({ status }: { status: UserStatus }) {
  const meta = STATUS_META[status];
  return <span className={`badge ${meta.cls}`}>{meta.label}</span>;
}

export function SourceBadge({ sourceId }: { sourceId: string }) {
  return <span className="badge badge-muted">{sourceId}</span>;
}

/** Mini graphe d'évolution du prix (SVG, sans dépendance). */
export function Sparkline({ points }: { points: PricePoint[] }) {
  if (points.length < 2) return null;
  const prices = points.map(p => p.price);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const span = max - min || 1;
  const w = 100;
  const h = 30;
  const step = w / (points.length - 1);
  const path = points
    .map((p, i) => {
      const x = i * step;
      const y = h - ((p.price - min) / span) * h;
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  const down = (prices[prices.length - 1] ?? 0) < (prices[0] ?? 0);
  return (
    <svg
      className="spark"
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      aria-hidden
    >
      <path
        d={path}
        fill="none"
        stroke={down ? 'var(--ok)' : 'var(--primary)'}
        strokeWidth={2}
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
