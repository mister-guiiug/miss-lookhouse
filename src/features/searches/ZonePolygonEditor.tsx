import { useEffect, useRef, useState } from 'react';
import * as L from 'leaflet';
import 'leaflet/dist/leaflet.css';

interface Props {
  /** Anneau GeoJSON [lng, lat] existant (ou null). */
  value: Array<[number, number]> | null;
  /** Centre initial de la vue (ex. point géocodé de la recherche). */
  center?: { lat: number; lng: number } | null;
  onChange: (ring: Array<[number, number]> | null) => void;
}

/**
 * Éditeur de zone : clic sur la carte = pose un sommet, le polygone se construit
 * en direct. Émet un anneau [lng, lat] dès ≥ 3 points (sinon null). Leaflet
 * impératif, chargé à la demande (lazy) pour ne pas alourdir le bundle.
 */
export function ZonePolygonEditor({ value, center, onChange }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const centerRef = useRef(center);

  // Points en [lat, lng] pour Leaflet (l'anneau stocké/émis est en [lng, lat]).
  const [pts, setPts] = useState<Array<[number, number]>>(
    value ? value.map(([lng, lat]) => [lat, lng]) : []
  );

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const c = centerRef.current;
    const start: [number, number] = c ? [c.lat, c.lng] : [46.6, 2.4];
    const map = L.map(el, { scrollWheelZoom: true }).setView(start, c ? 12 : 6);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap',
      maxZoom: 19,
    }).addTo(map);
    layerRef.current = L.layerGroup().addTo(map);
    map.on('click', (e: L.LeafletMouseEvent) => {
      setPts(prev => [...prev, [e.latlng.lat, e.latlng.lng]]);
    });
    return () => {
      map.remove();
      layerRef.current = null;
    };
  }, []);

  // Redessine les sommets + le polygone et émet l'anneau à chaque changement.
  useEffect(() => {
    const layer = layerRef.current;
    if (!layer) return;
    layer.clearLayers();
    for (const [lat, lng] of pts) {
      L.circleMarker([lat, lng], {
        radius: 5,
        color: '#0f766e',
        weight: 2,
        fillColor: '#14b8a6',
        fillOpacity: 0.9,
      }).addTo(layer);
    }
    if (pts.length >= 2) {
      L.polygon(pts as L.LatLngTuple[], {
        color: '#0f766e',
        weight: 2,
        fillColor: '#14b8a6',
        fillOpacity: 0.15,
      }).addTo(layer);
    }
    onChangeRef.current(
      pts.length >= 3
        ? pts.map(([lat, lng]) => [lng, lat] as [number, number])
        : null
    );
  }, [pts]);

  return (
    <div>
      <div
        ref={containerRef}
        className="map-container"
        style={{ height: '45vh', minHeight: 260 }}
      />
      <div className="row spread" style={{ marginTop: '0.4rem' }}>
        <span className="muted" style={{ fontSize: '0.78rem' }}>
          {pts.length < 3
            ? `Cliquez pour poser des sommets (${pts.length}/3 min).`
            : `${pts.length} sommets — zone définie.`}
        </span>
        <span className="row" style={{ gap: '0.4rem' }}>
          <button
            type="button"
            className="btn"
            onClick={() => setPts(prev => prev.slice(0, -1))}
            disabled={pts.length === 0}
          >
            Annuler le point
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => setPts([])}
            disabled={pts.length === 0}
          >
            Effacer
          </button>
        </span>
      </div>
    </div>
  );
}
