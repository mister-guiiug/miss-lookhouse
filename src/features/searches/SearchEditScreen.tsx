import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../../store/useAppStore';
import type { WatchFrequency } from '../../store/types';

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
function splitKeywords(v: string): string[] {
  return v
    .split(',')
    .map(k => k.trim())
    .filter(Boolean);
}

export function SearchEditScreen() {
  const navigate = useNavigate();
  const addSearch = useAppStore(s => s.addSearch);

  const [name, setName] = useState('');
  const [city, setCity] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [radiusKm, setRadiusKm] = useState('5');
  const [priceMin, setPriceMin] = useState('');
  const [priceMax, setPriceMax] = useState('');
  const [surfaceMin, setSurfaceMin] = useState('');
  const [surfaceMax, setSurfaceMax] = useState('');
  const [roomsMin, setRoomsMin] = useState('');
  const [roomsMax, setRoomsMax] = useState('');
  const [types, setTypes] = useState<string[]>(['appartement']);
  const [sources, setSources] = useState<string[]>(['leboncoin', 'seloger']);
  const [kwReq, setKwReq] = useState('');
  const [kwExcl, setKwExcl] = useState('');
  const [frequency, setFrequency] = useState<WatchFrequency>('hourly');

  const toggle = (arr: string[], v: string, set: (a: string[]) => void) =>
    set(arr.includes(v) ? arr.filter(x => x !== v) : [...arr, v]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    addSearch({
      name: name.trim(),
      sourceIds: sources,
      city: city || null,
      postalCode: postalCode || null,
      centerLat: null,
      centerLng: null,
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
      active: true,
      lastRunAt: null,
    });
    navigate('/recherches');
  };

  return (
    <form onSubmit={submit}>
      <h2 className="section-title">Nouvelle recherche</h2>
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

        <button
          type="submit"
          className="btn btn-primary"
          style={{ width: '100%', justifyContent: 'center' }}
        >
          Créer la recherche
        </button>
      </div>
    </form>
  );
}
