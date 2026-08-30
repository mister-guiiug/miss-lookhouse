/**
 * Géométrie propre au métier : appartenance à un rayon ou à une zone dessinée,
 * et similarité géographique entre deux annonces.
 *
 * CE QUI N'EST PLUS ICI. Le calcul de distance lui-même vient du socle
 * (`distanceKm`, promu de `mister-family-map`) : même formule de haversine,
 * même rayon terrestre — vérifié en lisant les deux implémentations, pas en
 * comparant des noms. Seule l'unité changeait, kilomètres contre mètres.
 *
 * CE QUI RESTE ICI, ET POURQUOI. Le socle sait mesurer et valider ; il ne sait
 * pas ce qu'est une zone de recherche. `pointInPolygon` (zones dessinées à la
 * main), `withinRadius` et `geoSimilarity` (tolérance au brouillage volontaire
 * des positions par les portails) n'ont aucun équivalent — et `geoSimilarity`
 * en particulier est une règle d'anti-doublon immobilier, pas de la géométrie.
 *
 * `isInBoundingBox` et `formatDistance` du socle ne sont pas repris : l'app
 * n'affiche jamais de distance et ne filtre jamais par cadre visible.
 */
import { distanceKm } from '@mister-guiiug/dev-wpa-config/geo';
import type { GeoPoint } from './geoTypes';

/** Distance orthodromique en mètres entre deux points GPS. */
export function haversineMeters(a: GeoPoint, b: GeoPoint): number {
  return distanceKm(a, b) * 1000;
}

/** Vrai si `point` est à moins de `radiusKm` du `center`. */
export function withinRadius(
  center: GeoPoint,
  point: GeoPoint,
  radiusKm: number
): boolean {
  return distanceKm(center, point) <= radiusKm;
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
