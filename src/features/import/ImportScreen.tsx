import { useEffect, useRef, useState } from 'react';
import { Bookmark, Info, Upload } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { BOOKMARKLET_HREF, BOOKMARKLET_SRC } from '../../ingestion/bookmarklet';

const EXAMPLE = JSON.stringify(
  [
    {
      source: 'leboncoin',
      id: '5005',
      url: 'https://www.leboncoin.fr/ventes_immobilieres/5005.htm',
      title: 'Appartement T4 avec balcon — Lyon 7e',
      description: 'Lumineux, 4 pièces, balcon, ascenseur, proche métro.',
      price: '262 000 €',
      surface: '84 m²',
      rooms: 4,
      type: 'Appartement',
      lat: 45.733,
      lng: 4.842,
      postalCode: '69007',
      city: 'Lyon',
    },
  ],
  null,
  2
);

export function ImportScreen() {
  const searches = useAppStore(s => s.data.searches);
  const importPayload = useAppStore(s => s.importPayload);

  const [payload, setPayload] = useState('');
  const [searchId, setSearchId] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{
    added: number;
    updated: number;
    warnings: string[];
  } | null>(null);

  // href du bookmarklet posé via ref (contourne le filtrage des URL javascript:).
  const bmRef = useRef<HTMLAnchorElement | null>(null);
  useEffect(() => {
    if (bmRef.current) bmRef.current.setAttribute('href', BOOKMARKLET_HREF);
  }, []);

  const run = async () => {
    setBusy(true);
    setResult(null);
    try {
      const r = await importPayload(payload, searchId || undefined);
      setResult(r);
      if (r.added + r.updated > 0) setPayload('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <h2 className="section-title">Importer des annonces</h2>

      <div className="card" style={{ borderColor: 'var(--primary)' }}>
        <div
          className="row"
          style={{ alignItems: 'flex-start', gap: '0.5rem' }}
        >
          <Info size={18} color="var(--primary)" aria-hidden />
          <p className="muted" style={{ margin: 0, fontSize: '0.84rem' }}>
            Collecte <strong>responsable</strong> : collez une{' '}
            <strong>URL d’annonce</strong> ou un <strong>JSON</strong> (objet ou
            tableau). Aucune aspiration automatique de sites tiers n’est
            effectuée. Les champs FR (« 245&nbsp;000&nbsp;€ », « 68&nbsp;m² »)
            sont normalisés.
          </p>
        </div>
      </div>

      <div className="card">
        <div className="field">
          <label htmlFor="search">
            Rattacher à une recherche (filtre de pertinence)
          </label>
          <select
            id="search"
            value={searchId}
            onChange={e => setSearchId(e.target.value)}
          >
            <option value="">— Aucune (pas de filtre) —</option>
            {searches.map(s => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="payload">URL ou JSON</label>
          <textarea
            id="payload"
            rows={8}
            value={payload}
            onChange={e => setPayload(e.target.value)}
            placeholder='https://… ou [ { "source": "leboncoin", … } ]'
            style={{ fontFamily: 'monospace', fontSize: '0.82rem' }}
          />
        </div>
        <div className="row">
          <button
            className="btn"
            onClick={() => setPayload(EXAMPLE)}
            type="button"
          >
            Charger un exemple
          </button>
          <button
            className="btn btn-primary"
            onClick={run}
            disabled={busy || !payload.trim()}
            style={{ marginLeft: 'auto' }}
          >
            <Upload size={16} aria-hidden /> {busy ? 'Import…' : 'Importer'}
          </button>
        </div>

        {result && (
          <div
            className="card"
            style={{ marginTop: '0.8rem', background: 'var(--surface-2)' }}
          >
            <p style={{ margin: 0 }}>
              ✅ {result.added} ajoutée(s), {result.updated} mise(s) à jour.
            </p>
            {result.warnings.length > 0 && (
              <ul
                className="muted"
                style={{ fontSize: '0.82rem', marginBottom: 0 }}
              >
                {result.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      <h2 className="section-title">Capture navigateur (avancé)</h2>
      <div className="card">
        <div
          className="row"
          style={{ alignItems: 'flex-start', gap: '0.5rem' }}
        >
          <Bookmark size={18} color="var(--primary)" aria-hidden />
          <p className="muted" style={{ margin: 0, fontSize: '0.84rem' }}>
            Glissez ce bouton dans votre <strong>barre de favoris</strong>, puis
            cliquez‑le sur une page d’annonce que vous consultez : il copie
            l’annonce (titre, prix, photo…) à coller ci‑dessus. Collecte{' '}
            <strong>100 % initiée par vous</strong>, rien n’est aspiré.
          </p>
        </div>
        <div className="row" style={{ marginTop: '0.6rem' }}>
          <a ref={bmRef} className="btn btn-primary" draggable>
            📌 Capturer dans Miss LookHouse
          </a>
          <button
            className="btn"
            type="button"
            onClick={() =>
              void navigator.clipboard?.writeText(BOOKMARKLET_HREF)
            }
          >
            Copier le code du favori
          </button>
        </div>
        <details style={{ marginTop: '0.6rem' }}>
          <summary
            className="muted"
            style={{ fontSize: '0.8rem', cursor: 'pointer' }}
          >
            Voir le code du bookmarklet
          </summary>
          <textarea
            readOnly
            rows={5}
            value={BOOKMARKLET_SRC}
            style={{
              fontFamily: 'monospace',
              fontSize: '0.7rem',
              marginTop: '0.4rem',
            }}
          />
        </details>
      </div>
    </>
  );
}
