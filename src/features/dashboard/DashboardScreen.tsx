import { Link } from 'react-router-dom';
import { PwaInstallPrompt } from '@mister-guiiug/dev-pwa-config/react/pwa-install-prompt';
import {
  Bell,
  CopyCheck,
  List,
  Map as MapIcon,
  Search,
  Upload,
} from 'lucide-react';
import { useAppStore, visibleSearches } from '../../store/useAppStore';
import { formatPrice, timeAgo } from '../../lib/format';
import { ScoreBadge, SourceBadge } from '../../components/ui';

export function DashboardScreen() {
  const listings = useAppStore(s => s.data.listings);
  const searches = useAppStore(s => s.data.searches);
  const pendingDeletions = useAppStore(s => s.pendingDeletions);
  const notifications = useAppStore(s => s.data.notifications);
  const similarities = useAppStore(s => s.data.similarities);

  const unread = notifications.filter(n => !n.readAt).length;
  // Une recherche en sursis ne compte plus : elle a disparu de « Recherches »,
  // la voir encore ici donnerait deux chiffres pour une seule vérité.
  const activeSearches = visibleSearches(searches, pendingDeletions).filter(
    s => s.active
  ).length;
  const dupes = similarities.filter(
    s => s.bucket === 'doublon_exact' || s.bucket === 'probable_identique'
  ).length;

  const recent = [...listings]
    .sort((a, b) => b.lastChangedAt.localeCompare(a.lastChangedAt))
    .slice(0, 4);

  const kpis = [
    { label: 'Annonces', value: listings.length, to: '/annonces', Icon: List },
    {
      label: 'Recherches actives',
      value: activeSearches,
      to: '/recherches',
      Icon: Search,
    },
    { label: 'Alertes', value: unread, to: '/notifications', Icon: Bell },
    { label: 'Doublons', value: dupes, to: '/similaires', Icon: CopyCheck },
  ];

  return (
    <>
      <div
        className="row"
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '0.6rem',
        }}
      >
        {kpis.map(({ label, value, to, Icon }) => (
          <Link key={label} to={to} className="card card-link">
            <div className="row spread">
              <Icon size={18} color="var(--primary)" aria-hidden />
              <span className="price">{value}</span>
            </div>
            <div className="muted" style={{ fontSize: '0.8rem' }}>
              {label}
            </div>
          </Link>
        ))}
      </div>

      <Link
        to="/import"
        className="btn btn-primary"
        style={{ justifyContent: 'center' }}
      >
        <Upload size={16} aria-hidden /> Importer des annonces
      </Link>

      <Link to="/carte" className="btn" style={{ justifyContent: 'center' }}>
        <MapIcon size={16} aria-hidden /> Voir la carte
      </Link>

      <h2 className="section-title">Récemment vues / modifiées</h2>
      {recent.length === 0 ? (
        <div className="empty">Aucune annonce. Importez-en pour démarrer.</div>
      ) : (
        recent.map(l => (
          <Link key={l.id} to={`/annonces/${l.id}`} className="card card-link">
            <div className="row spread">
              <p className="h-title">{l.title ?? 'Annonce sans titre'}</p>
              <span className="price">{formatPrice(l.price)}</span>
            </div>
            <div className="row" style={{ marginTop: '0.4rem' }}>
              <SourceBadge sourceId={l.sourceId} />
              <ScoreBadge score={l.relevanceScore} label="Pertinence" />
              <span
                className="muted"
                style={{ fontSize: '0.78rem', marginLeft: 'auto' }}
              >
                {timeAgo(l.lastChangedAt)}
              </span>
            </div>
          </Link>
        ))
      )}

      {/* ICI, ET PAS DANS LA COQUILLE : un bandeau global paraîtrait
          par-dessus une tâche en cours ; sur l'accueil, l'utilisateur est au
          repos. Ne rend rien tant qu'une installation n'est pas possible, ni
          une fois l'application installée — et sur iOS, où l'événement natif
          n'existe pas, donne la marche à suivre. Cadence du socle : au premier
          lancement, puis une fois par mois, trois fois. */}
      <PwaInstallPrompt />
    </>
  );
}
