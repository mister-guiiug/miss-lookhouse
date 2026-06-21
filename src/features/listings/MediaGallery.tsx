import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';

/**
 * Galerie de photos d'une annonce : vignettes + visionneuse plein écran
 * (lightbox) avec navigation clavier (← → Échap). Alimentée par les `mediaUrls`
 * (import / capture). Se masque toute seule s'il n'y a aucun média.
 */
export function MediaGallery({ urls }: { urls: string[] }) {
  const [open, setOpen] = useState<number | null>(null);
  const count = urls.length;

  useEffect(() => {
    if (open == null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(null);
      else if (e.key === 'ArrowLeft')
        setOpen(i => (i == null ? null : (i - 1 + count) % count));
      else if (e.key === 'ArrowRight')
        setOpen(i => (i == null ? null : (i + 1) % count));
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, count]);

  if (count === 0) return null;

  const close = () => setOpen(null);
  const go = (d: number) =>
    setOpen(i => (i == null ? null : (i + d + count) % count));
  const current = open == null ? undefined : urls[open];

  return (
    <div className="card">
      <h3 className="section-title">Photos ({count})</h3>
      <div className="gallery">
        {urls.map((u, i) => (
          <button
            key={i}
            type="button"
            className="gallery-thumb"
            onClick={() => setOpen(i)}
            aria-label={`Agrandir la photo ${i + 1}`}
          >
            <img src={u} alt={`Photo ${i + 1}`} loading="lazy" />
          </button>
        ))}
      </div>

      {open != null && current && (
        <div
          className="lightbox"
          role="dialog"
          aria-modal="true"
          onClick={close}
        >
          <button
            className="lightbox-close"
            onClick={close}
            aria-label="Fermer"
          >
            <X size={24} aria-hidden />
          </button>
          {count > 1 && (
            <button
              className="lightbox-nav left"
              aria-label="Photo précédente"
              onClick={e => {
                e.stopPropagation();
                go(-1);
              }}
            >
              <ChevronLeft size={28} aria-hidden />
            </button>
          )}
          <img
            className="lightbox-img"
            src={current}
            alt={`Photo ${open + 1} sur ${count}`}
            onClick={e => e.stopPropagation()}
          />
          {count > 1 && (
            <button
              className="lightbox-nav right"
              aria-label="Photo suivante"
              onClick={e => {
                e.stopPropagation();
                go(1);
              }}
            >
              <ChevronRight size={28} aria-hidden />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
