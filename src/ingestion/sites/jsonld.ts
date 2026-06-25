/**
 * Extraction des données structurées schema.org (JSON-LD) d'une page détail.
 * Les sites SEO (ex. squarehabitat.fr) embarquent une annonce typée
 * (Apartment/House/… + UnitPriceSpecification/Offer) bien plus fiable que du
 * scraping HTML. ⚠️ Le JSON-LD n'est présent que dans le HTML BRUT (une
 * conversion markdown le supprime) → toujours `fetcher.text()` la page entière.
 *
 * Pur : prend du HTML, renvoie un objet brut pour `parseListings`.
 */
import { parseNumberFr } from '../../domain/normalize';

/** Récupère et parse tous les blocs <script type="application/ld+json">. */
export function extractJsonLd(html: string): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  const blocks = html.matchAll(
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  );
  for (const b of blocks) {
    const text = (b[1] ?? '').trim();
    if (!text) continue;
    try {
      flatten(JSON.parse(text), out);
    } catch {
      // bloc JSON-LD invalide : ignoré.
    }
  }
  return out;
}

/** Aplatis tableaux et `@graph` en une liste d'objets. */
function flatten(node: unknown, out: Record<string, unknown>[]): void {
  if (Array.isArray(node)) {
    for (const n of node) flatten(n, out);
  } else if (node && typeof node === 'object') {
    const obj = node as Record<string, unknown>;
    if (Array.isArray(obj['@graph'])) flatten(obj['@graph'], out);
    if (obj['@type']) out.push(obj);
  }
}

/** Vrai si `@type` (string ou tableau) matche le motif. */
function typeMatches(obj: Record<string, unknown>, re: RegExp): boolean {
  const t = obj['@type'];
  const types = Array.isArray(t) ? t : [t];
  return types.some(x => typeof x === 'string' && re.test(x));
}

function num(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>;
    return num(o.value ?? o['@value'] ?? o.minPrice ?? o.price);
  }
  return parseNumberFr(v as string | number);
}

const TYPE_FR: ReadonlyArray<readonly [RegExp, string]> = [
  [/apartment|flat/i, 'appartement'],
  [/(single.?family)?house|residence|villa/i, 'maison'],
  [/land|terrain/i, 'terrain'],
];

function propertyTypeFr(obj: Record<string, unknown>): string | null {
  const t = obj['@type'];
  const types = (Array.isArray(t) ? t : [t]).filter(
    (x): x is string => typeof x === 'string'
  );
  for (const ty of types) {
    for (const [re, fr] of TYPE_FR) if (re.test(ty)) return fr;
  }
  return (obj.name as string) ?? null; // repli : normalizePropertyType lira le nom
}

/**
 * Construit un objet brut (pour `parseListings`) depuis les objets JSON-LD
 * d'une page. Cherche le « lieu » (Apartment/House/…) + le prix
 * (UnitPriceSpecification/Offer/PriceSpecification). Renvoie null si rien d'utile.
 */
export function jsonLdToRaw(
  objects: Record<string, unknown>[]
): Record<string, unknown> | null {
  const place = objects.find(o =>
    typeMatches(
      o,
      /apartment|house|residence|villa|place|product|realestatelisting|accommodation|land|terrain|singlefamilyresidence/i
    )
  );
  const priceObj = objects.find(o =>
    typeMatches(o, /unitpricespecification|pricespecification|offer/i)
  );
  if (!place && !priceObj) return null;

  const address = (place?.address as Record<string, unknown>) ?? {};
  const geo = (place?.geo as Record<string, unknown>) ?? {};
  const locality = (address.addressLocality as string) ?? null;
  const postalCode =
    (address.postalCode as string) ??
    (locality ? (/(\d{5})/.exec(locality)?.[1] ?? null) : null);
  const city = locality
    ? locality.replace(/\s*\d{5}.*$/, '').trim() || null
    : null;

  return {
    url: (place?.url as string) ?? (priceObj?.url as string) ?? null,
    title: (place?.name as string) ?? null,
    description: (place?.description as string) ?? null,
    type: place ? propertyTypeFr(place) : null,
    rooms: num(place?.numberOfRooms),
    surface: num(place?.floorSize),
    price: num(priceObj?.price ?? (place as Record<string, unknown>)?.price),
    currency: (priceObj?.priceCurrency as string) ?? 'EUR',
    city,
    postalCode,
    lat: num(geo.latitude),
    lng: num(geo.longitude),
  };
}
