import { useEffect, useMemo, useRef } from 'react';
import * as L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useAppStore } from '../../store/useAppStore';
import { formatPrice } from '../../lib/format';

// Couleurs fixes (les tuiles sont claires quel que soit le thème de l'app).
function relevanceColor(score: number | undefined): string {
  if (score == null) return '#0f766e';
  if (score >= 75) return '#15803d';
  if (score >= 50) return '#0f766e';
  return '#b45309';
}

function esc(s: unknown): string {
  return String(s ?? '').replace(
    /[&<>"]/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c
  );
}

/**
 * Carte des annonces (Leaflet, tuiles OpenStreetMap — sans clé). Marqueurs
 * colorés par pertinence, cercles de zone des recherches actives, popups vers
 * la fiche. Chargée à la demande (lazy) pour ne pas alourdir le bundle.
 */
export function MapScreen() {
  const listings = useAppStore(s => s.data.listings);
  const searches = useAppStore(s => s.data.searches);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const geoListings = useMemo(
    () => listings.filter(l => l.lat != null && l.lng != null),
    [listings]
  );
  const zones = useMemo(
    () =>
      searches.filter(
        s =>
          s.active && s.centerLat != null && s.centerLng != null && s.radiusKm
      ),
    [searches]
  );
  const polyZones = useMemo(
    () => searches.filter(s => s.active && s.polygon && s.polygon.length >= 3),
    [searches]
  );

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const map = L.map(el, { scrollWheelZoom: false }).setView([46.6, 2.4], 6);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap',
      maxZoom: 19,
    }).addTo(map);

    const bounds = L.latLngBounds([]);

    for (const z of zones) {
      const c = L.circle([z.centerLat as number, z.centerLng as number], {
        radius: (z.radiusKm as number) * 1000,
        color: '#0f766e',
        weight: 1,
        fillColor: '#14b8a6',
        fillOpacity: 0.08,
      }).addTo(map);
      c.bindTooltip(z.name);
      bounds.extend(c.getBounds());
    }

    for (const z of polyZones) {
      const latlngs = (z.polygon as Array<[number, number]>).map(
        ([lng, lat]) => [lat, lng] as L.LatLngTuple
      );
      const poly = L.polygon(latlngs, {
        color: '#0f766e',
        weight: 1,
        fillColor: '#14b8a6',
        fillOpacity: 0.08,
      }).addTo(map);
      poly.bindTooltip(z.name);
      bounds.extend(poly.getBounds());
    }

    for (const l of geoListings) {
      const lat = l.lat as number;
      const lng = l.lng as number;
      const color = relevanceColor(l.relevanceScore);
      const marker = L.circleMarker([lat, lng], {
        radius: 8,
        color,
        weight: 2,
        fillColor: color,
        fillOpacity: 0.6,
      }).addTo(map);
      marker.bindPopup(
        `<strong>${esc(l.title ?? 'Annonce')}</strong><br>` +
          `${esc(formatPrice(l.price))}${l.surfaceM2 ? ` · ${esc(l.surfaceM2)} m²` : ''}<br>` +
          `<span style="color:#4b6764">${esc(l.sourceId)}</span> · ` +
          `<a href="#/annonces/${esc(l.id)}">Voir la fiche</a>`
      );
      bounds.extend([lat, lng]);
    }

    if (bounds.isValid()) {
      map.fitBounds(bounds.pad(0.2), { maxZoom: 14 });
    }

    return () => {
      map.remove();
    };
  }, [geoListings, zones, polyZones]);

  return (
    <>
      <div className="row spread">
        <h2 className="section-title">Carte des annonces</h2>
        <span className="muted" style={{ fontSize: '0.8rem' }}>
          {geoListings.length} géolocalisée(s)
        </span>
      </div>
      {geoListings.length === 0 &&
      zones.length === 0 &&
      polyZones.length === 0 ? (
        <div className="empty">
          Aucune annonce géolocalisée. Importez des annonces avec coordonnées,
          ou « Localisez » la zone d’une recherche.
        </div>
      ) : (
        <>
          <div ref={containerRef} className="map-container" />
          <div className="row" style={{ fontSize: '0.74rem', gap: '0.8rem' }}>
            <span className="row" style={{ gap: '0.3rem' }}>
              <span className="map-dot" style={{ background: '#15803d' }} />{' '}
              Pertinence ≥ 75
            </span>
            <span className="row" style={{ gap: '0.3rem' }}>
              <span className="map-dot" style={{ background: '#0f766e' }} />{' '}
              50–74
            </span>
            <span className="row" style={{ gap: '0.3rem' }}>
              <span className="map-dot" style={{ background: '#b45309' }} />{' '}
              &lt; 50
            </span>
          </div>
        </>
      )}
    </>
  );
}
