import { Badge } from '@mister-guiiug/dev-wpa-config/react/badge';
import type { BadgeTone } from '@mister-guiiug/dev-wpa-config/react/badge';
import { Sparkline as DwcSparkline } from '@mister-guiiug/dev-wpa-config/react/sparkline';
import type { SimilarityBucket } from '../domain/types';
import type { UserStatus, PricePoint } from '../store/types';
import { formatPrice } from '../lib/format';

/**
 * Pastilles métier, déléguées au `Badge` du socle (`react/badge`) : ton
 * SÉMANTIQUE + variante `soft` — la même recette de fond teinté à 16 % que
 * l'ancien kit maison, avec un contraste du texte dérivé du thème en prime.
 *
 * Les classes `.badge badge-*` de `styles.css` restent : les écrans les posent
 * aussi sur des CHIPS interactifs (boutons de statut, tags), hors du périmètre
 * de ce composant.
 */

/** Correspondance kit maison → ton sémantique du socle. */
const TONE_BY_CLS: Record<string, BadgeTone> = {
  'badge-ok': 'success',
  'badge-primary': 'brand',
  'badge-warn': 'warning',
  'badge-danger': 'danger',
  'badge-muted': 'muted',
};

export function ScoreBadge({
  score,
  label,
}: {
  score: number | null | undefined;
  label: string;
}) {
  if (score == null) return null;
  const tone: BadgeTone =
    score >= 75 ? 'success' : score >= 50 ? 'brand' : 'warning';
  return (
    <Badge tone={tone} title={`${label} ${score}/100`}>
      {label} {score}
    </Badge>
  );
}

const BUCKET_META: Record<
  SimilarityBucket,
  { label: string; tone: BadgeTone }
> = {
  doublon_exact: { label: 'Doublon exact', tone: 'danger' },
  probable_identique: { label: 'Probablement identique', tone: 'warning' },
  similaire: { label: 'Similaire', tone: 'brand' },
  different: { label: 'Différente', tone: 'muted' },
};

export function BucketBadge({ bucket }: { bucket: SimilarityBucket }) {
  const meta = BUCKET_META[bucket];
  return <Badge tone={meta.tone}>{meta.label}</Badge>;
}

/** `cls` conservé : les chips interactifs de ListingDetailScreen s'en servent. */
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
  return <Badge tone={TONE_BY_CLS[meta.cls] ?? 'muted'}>{meta.label}</Badge>;
}

export function SourceBadge({ sourceId }: { sourceId: string }) {
  return <Badge>{sourceId}</Badge>;
}

/**
 * Mini graphe d'évolution du prix, délégué au socle (`react/sparkline`) : la
 * géométrie (série trouée, dernier point marqué) et l'alternative textuelle
 * (`describeSeries`) viennent de là ; les calculs métier restent dans
 * `domain/priceHistory`. Encre : la primaire du thème (components.css), passée
 * en `--ok` quand le prix baisse — bonne nouvelle pour un acheteur.
 */
export function Sparkline({ points }: { points: PricePoint[] }) {
  if (points.length < 2) return null;
  const prices = points.map(p => p.price);
  const down = (prices[prices.length - 1] ?? 0) < (prices[0] ?? 0);
  return (
    <DwcSparkline
      values={prices}
      width={300}
      height={44}
      label="évolution du prix"
      format={formatPrice}
      className={down ? 'spark-down' : undefined}
    />
  );
}
