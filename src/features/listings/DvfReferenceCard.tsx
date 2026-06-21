import { useState } from 'react';
import { TrendingUp } from 'lucide-react';
import { IS_SUPABASE } from '../../backend/config';
import {
  getDvfReference,
  toDvfType,
  marketDelta,
  type DvfReference,
} from '../../lib/dvf';

interface Props {
  postalCode?: string | null;
  city?: string | null;
  propertyType?: string | null;
  price?: number | null;
  surfaceM2?: number | null;
}

const fr = (n: number | null | undefined) =>
  n == null ? '—' : n.toLocaleString('fr-FR');

export function DvfReferenceCard({
  postalCode,
  city,
  propertyType,
  price,
  surfaceM2,
}: Props) {
  const dvfType = toDvfType(propertyType);
  const [ref, setRef] = useState<DvfReference | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Pertinent uniquement en mode Supabase, pour un appartement/maison localisé.
  if (!IS_SUPABASE || !postalCode || !dvfType) return null;

  const listingPpm = price && surfaceM2 ? price / surfaceM2 : null;
  const delta = ref ? marketDelta(listingPpm, ref.median) : null;

  const load = async () => {
    setBusy(true);
    setErr(null);
    try {
      setRef(
        await getDvfReference({
          codePostal: postalCode,
          typeLocal: dvfType,
          city,
        })
      );
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Service indisponible.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card">
      <h3 className="section-title">
        <TrendingUp size={14} aria-hidden /> Prix de référence (DVF)
      </h3>

      {!ref && !err && (
        <button
          className="btn"
          onClick={() => void load()}
          disabled={busy}
          style={{ marginTop: '0.4rem' }}
        >
          {busy ? 'Interrogation…' : 'Comparer au marché'}
        </button>
      )}

      {ref && ref.count > 0 && (
        <>
          <div className="row spread" style={{ marginTop: '0.3rem' }}>
            <span>Médiane {dvfType.toLowerCase()}</span>
            <span className="price" style={{ fontSize: '1.1rem' }}>
              {fr(ref.median)} €/m²
            </span>
          </div>
          {listingPpm != null && delta && (
            <div className="row spread" style={{ marginTop: '0.3rem' }}>
              <span className="muted" style={{ fontSize: '0.85rem' }}>
                Cette annonce : {fr(Math.round(listingPpm))} €/m²
              </span>
              <span
                className={`badge ${delta.over ? 'badge-warn' : 'badge-ok'}`}
              >
                {delta.over ? '+' : ''}
                {delta.pct} % vs marché
              </span>
            </div>
          )}
          <span
            className="muted"
            style={{
              fontSize: '0.76rem',
              display: 'block',
              marginTop: '0.3rem',
            }}
          >
            {ref.count} ventes ({ref.year}) · fourchette {fr(ref.p25)}–
            {fr(ref.p75)} €/m² · source DVF (open data)
          </span>
        </>
      )}

      {ref && ref.count === 0 && (
        <p
          className="muted"
          style={{ fontSize: '0.85rem', margin: '0.3rem 0 0' }}
        >
          Pas de données DVF pour cette commune / ce type de bien.
        </p>
      )}

      {err && (
        <p
          style={{
            fontSize: '0.82rem',
            color: 'var(--danger)',
            margin: '0.3rem 0 0',
          }}
        >
          {err}
        </p>
      )}
    </div>
  );
}
