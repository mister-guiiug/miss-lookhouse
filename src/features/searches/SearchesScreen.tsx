import { Link } from 'react-router-dom';
import { Plus, Trash2, Clock } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { formatPrice } from '../../lib/format';

export function SearchesScreen() {
  const searches = useAppStore(s => s.data.searches);
  const deleteSearch = useAppStore(s => s.deleteSearch);

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

      {searches.length === 0 ? (
        <div className="empty">
          Aucune recherche. Créez-en une pour définir votre veille.
        </div>
      ) : (
        searches.map(s => (
          <div key={s.id} className="card">
            <div className="row spread">
              <p className="h-title">{s.name}</p>
              <span
                className={`badge ${s.active ? 'badge-ok' : 'badge-muted'}`}
              >
                {s.active ? 'Active' : 'Inactive'}
              </span>
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
              <button
                className="btn"
                style={{ marginLeft: 'auto', padding: '0.35rem 0.6rem' }}
                onClick={() => {
                  if (confirm(`Supprimer la recherche « ${s.name} » ?`))
                    deleteSearch(s.id);
                }}
                aria-label="Supprimer"
              >
                <Trash2 size={15} aria-hidden />
              </button>
            </div>
          </div>
        ))
      )}
    </>
  );
}
