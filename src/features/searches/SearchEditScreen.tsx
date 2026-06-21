import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAppStore } from '../../store/useAppStore';
import type { LocalSearch, WatchFrequency } from '../../store/types';

const PROPERTY_TYPES = [
  'appartement',
  'maison',
  'terrain',
  'parking',
  'immeuble',
  'local',
];
const SOURCES = ['leboncoin', 'seloger', 'bienici', 'pap', 'import_generique'];

function toNum(v: string): number | null {
  const n = Number(v.replace(',', '.'));
  return v.trim() === '' || Number.isNaN(n) ? null : n;
}
function numStr(n: number | null | undefined): string {
  return n == null ? '' : String(n);
}
function splitKeywords(v: string): string[] {
  return v
    .split(',')
    .map(k => k.trim())
    .filter(Boolean);
}

/** Création OU modification d'une recherche selon la présence d'un id en route. */
export function SearchEditScreen() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const searches = useAppStore(s => s.data.searches);
  const addSearch = useAppStore(s => s.addSearch);
  const updateSearch = useAppStore(s => s.updateSearch);

  const editing = id ? searches.find(s => s.id === id) : undefined;
  const isEdit = Boolean(id);

  const [name, setName] = useState(editing?.name ?? '');
  const [city, setCity] = useState(editing?.city ?? '');
  const [postalCode, setPostalCode] = useState(editing?.postalCode ?? '');
  const [radiusKm, setRadiusKm] = useState(numStr(editing?.radiusKm) || '5');
  const [priceMin, setPriceMin] = useState(numStr(editing?.priceMin));
  const [priceMax, setPriceMax] = useState(numStr(editing?.priceMax));
  const [surfaceMin, setSurfaceMin] = useState(numStr(editing?.surfaceMin));
  const [surfaceMax, setSurfaceMax] = useState(numStr(editing?.surfaceMax));
  const [roomsMin, setRoomsMin] = useState(numStr(editing?.roomsMin));
  const [roomsMax, setRoomsMax] = useState(numStr(editing?.roomsMax));
  const [types, setTypes] = useState<string[]>(
    editing?.propertyTypes ?? ['appartement']
  );
  const [sources, setSources] = useState<string[]>(
    editing?.sourceIds ?? ['leboncoin', 'seloger']
  );
  const [kwReq, setKwReq] = useState(
    (editing?.keywordsRequired ?? []).join(', ')
  );
  const [kwExcl, setKwExcl] = useState(
    (editing?.keywordsExcluded ?? []).join(', ')
  );
  const [frequency, setFrequency] = useState<WatchFrequency>(
    editing?.frequency ?? 'hourly'
  );

  // id présent mais recherche introuvable → message clair.
  if (isEdit && !editing) {
    return (
      <div className="empty">
        Recherche introuvable. <Link to="/recherches">Retour</Link>
      </div>
    );
  }

  const toggle = (arr: string[], v: string, set: (a: string[]) => void) =>
    set(arr.includes(v) ? arr.filter(x => x !== v) : [...arr, v]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    const payload: Omit<LocalSearch, 'id'> = {
      name: name.trim(),
      sourceIds: sources,
      city: city || null,
      postalCode: postalCode || null,
      centerLat: editing?.centerLat ?? null,
      centerLng: editing?.centerLng ?? null,
      radiusKm: toNum(radiusKm),
      priceMin: toNum(priceMin),
      priceMax: toNum(priceMax),
      surfaceMin: toNum(surfaceMin),
      surfaceMax: toNum(surfaceMax),
      roomsMin: toNum(roomsMin),
      roomsMax: toNum(roomsMax),
      propertyTypes: types,
      keywordsRequired: splitKeywords(kwReq),
      keywordsExcluded: splitKeywords(kwExcl),
      frequency,
      active: editing?.active ?? true,
      lastRunAt: editing?.lastRunAt ?? null,
    };
    if (editing) updateSearch(editing.id, payload);
    else addSearch(payload);
    navigate('/recherches');
  };

  return (
    <form onSubmit={submit}>
      <h2 className="section-title">
        {isEdit ? 'Modifier la recherche' : 'Nouvelle recherche'}
      </h2>
      <div className="card">
        <div className="field">
          <label htmlFor="name">Nom *</label>
          <input
            id="name"
            value={name}
            onChange={e => setName(e.target.value)}
            required
            placeholder="T3 Lyon presqu’île"
          />
        </div>
        <div className="row" style={{ gap: '0.5rem' }}>
          <div className="field" style={{ flex: 1 }}>
            <label htmlFor="city">Ville</label>
            <input
              id="city"
              value={city}
              onChange={e => setCity(e.target.value)}
              placeholder="Lyon"
            />
          </div>
          <div className="field" style={{ flex: 1 }}>
            <label htmlFor="cp">Code postal</label>
            <input
              id="cp"
              value={postalCode}
              onChange={e => setPostalCode(e.target.value)}
              placeholder="69007"
            />
          </div>
          <div className="field" style={{ width: 90 }}>
            <label htmlFor="radius">Rayon (km)</label>
            <input
              id="radius"
              value={radiusKm}
              onChange={e => setRadiusKm(e.target.value)}
              inputMode="decimal"
            />
          </div>
        </div>

        <div className="row" style={{ gap: '0.5rem' }}>
          <div className="field" style={{ flex: 1 }}>
            <label>Budget min</label>
            <input
              value={priceMin}
              onChange={e => setPriceMin(e.target.value)}
              inputMode="numeric"
              placeholder="150000"
            />
          </div>
          <div className="field" style={{ flex: 1 }}>
            <label>Budget max</label>
            <input
              value={priceMax}
              onChange={e => setPriceMax(e.target.value)}
              inputMode="numeric"
              placeholder="280000"
            />
          </div>
        </div>
        <div className="row" style={{ gap: '0.5rem' }}>
          <div className="field" style={{ flex: 1 }}>
            <label>Surface min</label>
            <input
              value={surfaceMin}
              onChange={e => setSurfaceMin(e.target.value)}
              inputMode="numeric"
            />
          </div>
          <div className="field" style={{ flex: 1 }}>
            <label>Surface max</label>
            <input
              value={surfaceMax}
              onChange={e => setSurfaceMax(e.target.value)}
              inputMode="numeric"
            />
          </div>
          <div className="field" style={{ flex: 1 }}>
            <label>Pièces min</label>
            <input
              value={roomsMin}
              onChange={e => setRoomsMin(e.target.value)}
              inputMode="numeric"
            />
          </div>
          <div className="field" style={{ flex: 1 }}>
            <label>Pièces max</label>
            <input
              value={roomsMax}
              onChange={e => setRoomsMax(e.target.value)}
              inputMode="numeric"
            />
          </div>
        </div>

        <div className="field">
          <label>Type de bien</label>
          <div className="row">
            {PROPERTY_TYPES.map(t => (
              <button
                type="button"
                key={t}
                className={`badge ${types.includes(t) ? 'badge-primary' : 'badge-muted'}`}
                onClick={() => toggle(types, t, setTypes)}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <label>Sources</label>
          <div className="row">
            {SOURCES.map(src => (
              <button
                type="button"
                key={src}
                className={`badge ${sources.includes(src) ? 'badge-primary' : 'badge-muted'}`}
                onClick={() => toggle(sources, src, setSources)}
              >
                {src}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <label htmlFor="kwReq">
            Mots-clés requis (séparés par des virgules)
          </label>
          <input
            id="kwReq"
            value={kwReq}
            onChange={e => setKwReq(e.target.value)}
            placeholder="balcon, ascenseur"
          />
        </div>
        <div className="field">
          <label htmlFor="kwExcl">Mots-clés exclus</label>
          <input
            id="kwExcl"
            value={kwExcl}
            onChange={e => setKwExcl(e.target.value)}
            placeholder="rez-de-chaussée, travaux"
          />
        </div>

        <div className="field">
          <label htmlFor="freq">Fréquence de surveillance</label>
          <select
            id="freq"
            value={frequency}
            onChange={e => setFrequency(e.target.value as WatchFrequency)}
          >
            <option value="hourly">Toutes les heures</option>
            <option value="daily">Quotidienne</option>
            <option value="manual">Manuelle</option>
          </select>
        </div>

        <div className="row" style={{ gap: '0.5rem' }}>
          <Link
            to="/recherches"
            className="btn"
            style={{ flex: 1, justifyContent: 'center' }}
          >
            Annuler
          </Link>
          <button
            type="submit"
            className="btn btn-primary"
            style={{ flex: 2, justifyContent: 'center' }}
          >
            {isEdit ? 'Enregistrer les modifications' : 'Créer la recherche'}
          </button>
        </div>
      </div>
    </form>
  );
}
