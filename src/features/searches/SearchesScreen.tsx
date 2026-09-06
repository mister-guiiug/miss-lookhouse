import { Link } from 'react-router-dom';
import { Clock, Pencil, Plus, Trash2 } from 'lucide-react';
import { useAppStore, visibleSearches } from '../../store/useAppStore';
import { formatPrice } from '../../lib/format';

export function SearchesScreen() {
  const searches = useAppStore(s => s.data.searches);
  const pendingDeletions = useAppStore(s => s.pendingDeletions);
  const setSearchActive = useAppStore(s => s.setSearchActive);
  const deleteSearch = useAppStore(s => s.deleteSearch);

  // Filtré ICI, pas dans le sélecteur : un `filter` dans un sélecteur rend une
  // référence neuve à chaque appel (boucle `useSyncExternalStore`).
  // Une recherche en sursis disparaît de la liste, mais reste dans le store —
  // c'est ce qui permet de la rendre intacte huit secondes durant.
  const visible = visibleSearches(searches, pendingDeletions);

  return (
    <>
      <div className="row spread">
        <h2 className="section-title">Recherches surveillées</h2>
        <Link
          to="/recherches/nouvelle"
          className="btn btn-primary"
          style={{ padding: '0.4rem 0.7rem' }}
        >
          <Plus size={16} aria-hidden /> Nouvelle
        </Link>
      </div>

      {visible.length === 0 ? (
        <div className="empty">
          Aucune recherche. Créez-en une pour définir votre veille.
        </div>
      ) : (
        visible.map(s => (
          <div
            key={s.id}
            className="card"
            style={{ opacity: s.active ? 1 : 0.7 }}
          >
            <div className="row spread">
              <p className="h-title">{s.name}</p>
              <button
                type="button"
                role="switch"
                aria-checked={s.active}
                aria-label={
                  s.active
                    ? 'Désactiver la surveillance'
                    : 'Activer la surveillance'
                }
                className={`badge ${s.active ? 'badge-ok' : 'badge-muted'}`}
                onClick={() => setSearchActive(s.id, !s.active)}
              >
                {s.active ? 'Active' : 'Inactive'}
              </button>
            </div>
            <div
              className="muted"
              style={{ fontSize: '0.82rem', marginTop: '0.3rem' }}
            >
              {[
                s.city,
                s.radiusKm ? `${s.radiusKm} km` : null,
                s.priceMin || s.priceMax
                  ? `${formatPrice(s.priceMin)} – ${formatPrice(s.priceMax)}`
                  : null,
                s.propertyTypes.length ? s.propertyTypes.join(', ') : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </div>
            <div className="row" style={{ marginTop: '0.5rem' }}>
              <span className="badge badge-muted">
                <Clock size={12} aria-hidden /> {s.frequency}
              </span>
              {s.sourceIds.map(src => (
                <span key={src} className="badge badge-muted">
                  {src}
                </span>
              ))}
              <div
                className="row"
                style={{ marginLeft: 'auto', gap: '0.4rem' }}
              >
                <Link
                  to={`/recherches/${s.id}/modifier`}
                  className="btn"
                  style={{ padding: '0.35rem 0.6rem' }}
                  aria-label="Modifier"
                >
                  <Pencil size={15} aria-hidden />
                </Link>
                {/* Plus de « êtes-vous sûr ? » : l'annulation REMPLACE la
                    confirmation, elle ne s'y ajoute pas. Le geste part tout de
                    suite, et se rattrape pendant huit secondes. */}
                <button
                  className="btn"
                  style={{ padding: '0.35rem 0.6rem' }}
                  onClick={() => deleteSearch(s.id)}
                  aria-label={`Supprimer la recherche « ${s.name} »`}
                >
                  <Trash2 size={15} aria-hidden />
                </button>
              </div>
            </div>
          </div>
        ))
      )}
    </>
  );
}
