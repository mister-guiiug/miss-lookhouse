// @generated par scripts/build-edge-core.mjs — NE PAS ÉDITER.
// Source : src/domain/normalize.ts · Régénérer : npm run build:edge-core

/**
 * Normalisation pure : accents, nombres FR, type de bien, empreinte stable.
 * Aucune dépendance externe.
 */

/** Retire les accents/diacritiques et passe en minuscules. */
export function stripAccents(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // diacritiques combinants
    .toLowerCase();
}

/** Réduit les espaces multiples et trim. */
export function squashWhitespace(input: string): string {
  return input.replace(/\s+/g, ' ').trim();
}

/**
 * Parse un nombre à la française : « 245 000 € », « 245.000,50 », « 72,5 m² ».
 * Retourne null si rien d'exploitable.
 */
export function parseNumberFr(
  input: string | number | null | undefined
): number | null {
  if (input == null) return null;
  if (typeof input === 'number') return Number.isFinite(input) ? input : null;
  // Garde chiffres, séparateurs ; retire espaces (insécables inclus) et symboles.
  const cleaned = input
    .replace(/\s/g, '')
    .replace(/[^\d.,-]/g, '')
    .trim();
  if (!cleaned) return null;
  // Heuristique : la dernière occurrence de , ou . est le séparateur décimal.
  const lastComma = cleaned.lastIndexOf(',');
  const lastDot = cleaned.lastIndexOf('.');
  let normalized: string;
  if (lastComma > lastDot) {
    // Format FR : « . » = milliers, « , » = décimales.
    normalized = cleaned.replace(/\./g, '').replace(',', '.');
  } else {
    // Format EN : « , » = milliers.
    normalized = cleaned.replace(/,/g, '');
  }
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

const PROPERTY_TYPE_MAP: ReadonlyArray<readonly [RegExp, string]> = [
  [
    /\b(appartement|appart|appt|studio|t[1-9]|f[1-9]|duplex|loft)\b/,
    'appartement',
  ],
  [/\b(maison|villa|pavillon|longere|mas|chalet)\b/, 'maison'],
  [/\b(terrain|parcelle|foncier)\b/, 'terrain'],
  [/\b(parking|garage|box)\b/, 'parking'],
  [/\b(immeuble)\b/, 'immeuble'],
  [/\b(local|commerce|bureau|entrepot|hangar)\b/, 'local'],
];

/** Normalise un type de bien hétérogène vers une valeur canonique. */
export function normalizePropertyType(
  input: string | null | undefined
): string | null {
  if (!input) return null;
  const s = stripAccents(input);
  for (const [re, canonical] of PROPERTY_TYPE_MAP) {
    if (re.test(s)) return canonical;
  }
  return 'autre';
}

/** Hash FNV-1a 32 bits → hex (déterministe, non cryptographique). */
export function fnv1aHex(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  // >>> 0 pour rester non signé.
  return (h >>> 0).toString(16).padStart(8, '0');
}

/**
 * Empreinte de CONTENU stable d'une annonce : sert à détecter qu'une version a
 * changé (prix, surface, pièces, titre, description). Volontairement insensible
 * aux espaces et à la casse.
 */
export function listingFingerprint(parts: {
  price?: number | null;
  surfaceM2?: number | null;
  rooms?: number | null;
  title?: string | null;
  description?: string | null;
}): string {
  const norm = [
    parts.price ?? '',
    parts.surfaceM2 ?? '',
    parts.rooms ?? '',
    squashWhitespace(stripAccents(parts.title ?? '')),
    squashWhitespace(stripAccents(parts.description ?? '')),
  ].join('|');
  return fnv1aHex(norm);
}
