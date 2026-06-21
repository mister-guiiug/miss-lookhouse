/**
 * Géocodage via la Base Adresse Nationale (`api-adresse.data.gouv.fr`) :
 * service public officiel, gratuit, sans clé. Convertit « ville / code postal /
 * adresse » → coordonnées GPS pour activer le filtre rayon/polygone réel.
 *
 * Le parsing de la réponse est PUR (testable sans réseau) ; `geocode` n'ajoute
 * que l'appel `fetch`. Base configurable via `VITE_GEOCODER_URL`.
 */
const BASE =
  import.meta.env.VITE_GEOCODER_URL ?? 'https://api-adresse.data.gouv.fr';

export interface GeocodeResult {
  lat: number;
  lng: number;
  label: string;
  postcode: string | null;
  city: string | null;
  score: number;
}

interface BanFeature {
  geometry?: { coordinates?: [number, number] };
  properties?: {
    label?: string;
    postcode?: string;
    city?: string;
    score?: number;
  };
}
interface BanResponse {
  features?: BanFeature[];
}

/** Extrait le meilleur résultat d'une FeatureCollection GeoJSON de la BAN. */
export function parseBanResponse(json: unknown): GeocodeResult | null {
  const res = json as BanResponse;
  const feature = res.features?.[0];
  const coords = feature?.geometry?.coordinates;
  if (!feature || !coords) return null;
  // GeoJSON : [longitude, latitude].
  const [lng, lat] = coords;
  if (typeof lat !== 'number' || typeof lng !== 'number') return null;
  return {
    lat,
    lng,
    label: feature.properties?.label ?? '',
    postcode: feature.properties?.postcode ?? null,
    city: feature.properties?.city ?? null,
    score: feature.properties?.score ?? 0,
  };
}

/** Géocode une requête libre (« 69007 Lyon »). null si rien d'exploitable. */
export async function geocode(
  query: string,
  opts?: { signal?: AbortSignal }
): Promise<GeocodeResult | null> {
  const q = query.trim();
  if (!q) return null;
  const url = `${BASE}/search/?q=${encodeURIComponent(q)}&limit=1`;
  const res = await fetch(url, opts?.signal ? { signal: opts.signal } : {});
  if (!res.ok) throw new Error(`Géocodage indisponible (${res.status}).`);
  return parseBanResponse(await res.json());
}
