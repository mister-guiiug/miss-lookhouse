// @generated par scripts/build-edge-core.mjs — NE PAS ÉDITER.
// Source : src/domain/geo.ts · Régénérer : npm run build:edge-core

/**
 * Géométrie pure : distance haversine (mètres), appartenance à un rayon, et
 * test point-dans-polygone (ray casting) pour les zones personnalisées.
 */
import type { GeoPoint } from './geoTypes.ts';

const EARTH_RADIUS_M = 6_371_000;

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/** Distance orthodromique en mètres entre deux points GPS. */
export function haversineMeters(a: GeoPoint, b: GeoPoint): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Vrai si `point` est à moins de `radiusKm` du `center`. */
export function withinRadius(
  center: GeoPoint,
  point: GeoPoint,
  radiusKm: number
): boolean {
  return haversineMeters(center, point) <= radiusKm * 1000;
}

/**
 * Point dans un polygone (anneau GeoJSON de paires [lng, lat]). Algorithme du
 * lancer de rayon. Le polygone n'a pas besoin d'être fermé.
 */
export function pointInPolygon(
  point: GeoPoint,
  ring: Array<[number, number]>
): boolean {
  const x = point.lng;
  const y = point.lat;
  let inside = false;
  const n = ring.length;
  if (n < 3) return false;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const vi = ring[i];
    const vj = ring[j];
    if (!vi || !vj) continue;
    const xi = vi[0];
    const yi = vi[1];
    const xj = vj[0];
    const yj = vj[1];
    const intersect =
      yi > y !== yj > y &&
      x < ((xj - xi) * (y - yi)) / (yj - yi + Number.EPSILON) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * Similarité géographique 0..1 : décroît linéairement avec la distance jusqu'à
 * `toleranceM` (au-delà → 0). Tolérante par défaut car les portails brouillent
 * souvent la position exacte des biens.
 */
export function geoSimilarity(
  a: GeoPoint,
  b: GeoPoint,
  toleranceM = 2000
): number {
  const d = haversineMeters(a, b);
  return Math.max(0, 1 - d / toleranceM);
}
