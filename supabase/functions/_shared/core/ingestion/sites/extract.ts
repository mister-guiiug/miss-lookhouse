// @generated par scripts/build-edge-core.mjs — NE PAS ÉDITER.
// Source : src/ingestion/sites/extract.ts · Régénérer : npm run build:edge-core

/**
 * Extracteurs PURS pour les connecteurs de site : prix/surface depuis du HTML,
 * découpage « Ville - 63500 », filtre vente/vendu. Aucune dépendance réseau ni
 * DOM (regex sur le texte) → testables hors ligne et compatibles Deno.
 */
import { parseNumberFr } from '../../domain/normalize.ts';

// Séparateurs de milliers FR : chiffres, point, espace, espace insécable, fine insécable.
// (escapes \u… volontaires : pas d'espace insécable littéral → pas de no-irregular-whitespace)
const NUM = '[\\d.\\u0020\\u00a0\\u202f]';
const PRICE_RE = new RegExp(`(\\d${NUM}{3,})\\s*€`, 'g');

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, ' ');
}

/**
 * Prix € : d'abord le montant suivant le label « prix », sinon le PREMIER
 * montant plausible en ordre de lecture (le prix d'appel précède les tableaux
 * annexes ; `max()` serait piégé par un tableau de coûts d'énergie « 2 218000 € »).
 */
export function extractPriceEur(html: string): number | null {
  const text = stripTags(html);
  const labelled = new RegExp(
    `prix[^0-9€]{0,40}?(\\d${NUM}{3,})\\s*€`,
    'i'
  ).exec(text);
  const cand = labelled?.[1] ? parseNumberFr(labelled[1]) : null;
  if (cand != null && cand >= 1000) return cand;
  const all = [...text.matchAll(PRICE_RE)]
    .map(m => parseNumberFr(m[1]))
    .filter((n): n is number => n != null && n >= 10000 && n <= 20_000_000);
  return all.length ? (all[0] as number) : null;
}

/** Surface m² : d'abord après « surface », sinon la 1ʳᵉ valeur m² plausible. */
export function extractSurfaceM2(html: string): number | null {
  const text = stripTags(html);
  const labelled =
    /surface[^0-9]{0,40}?(\d+(?:[.,]\d+)?)\s*m(?:²|2)(?!\w)/i.exec(text);
  const cand = labelled?.[1] ? parseNumberFr(labelled[1]) : null;
  if (cand != null && cand > 0) return cand;
  const m = /(\d+(?:[.,]\d+)?)\s*m(?:²|2)(?!\w)/i.exec(text);
  return m?.[1] ? parseNumberFr(m[1]) : null;
}

/** « Coudes - 63114 » → { city: 'Coudes', postalCode: '63114' }. */
export function splitLocation(name: string | null): {
  city: string | null;
  postalCode: string | null;
} {
  if (!name) return { city: null, postalCode: null };
  const cp = /(\d{5})/.exec(name)?.[1] ?? null;
  const city = name.split(/\s[-–]\s/)[0]?.trim() || null;
  return { city, postalCode: cp };
}

/** « À Coudes, Maison … » → « Coudes ». */
export function cityFromTitle(title: string | null): string | null {
  if (!title) return null;
  const m = /^à\s+([^,]+),/i.exec(title.trim());
  return m?.[1]?.trim() ?? null;
}

/** Statut « à vendre » oui ; « vendu » non. */
export function isForSaleStatus(statusName: string): boolean {
  const s = statusName.toLowerCase();
  if (/vendu/.test(s)) return false;
  return /(vendre|offre|compromis|disponible|vente)/.test(s) || s === 'vente';
}

/** Contenu de la balise <title>, suffixe « | Site » retiré. */
export function extractTitleTag(html: string): string | null {
  const m = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  if (!m?.[1]) return null;
  const t = m[1].replace(/\s+/g, ' ').trim();
  return t.split('|')[0]?.trim() || t || null;
}

/** Nombre de pièces depuis « 4 pièces ». */
export function extractRooms(text: string): number | null {
  const m = /(\d+)\s*pi[èe]ces?/i.exec(text);
  return m?.[1] ? parseNumberFr(m[1]) : null;
}

/**
 * Ville depuis un titre « Vente {type} {Ville} … {N}m²/{N} pièces … » (La Boite
 * Immo, Netty…). Best-effort : lettres entre le type et le 1er nombre.
 */
export function cityFromVenteTitle(title: string | null): string | null {
  if (!title) return null;
  const m = /vente\s+\p{L}+\s+(\p{L}[\p{L}\s'’-]*?)\s+\d/iu.exec(title);
  return m?.[1]?.trim() || null;
}

/** Clé d'annonce stable = dernier segment de chemin de l'URL. */
export function listingKeyFromUrl(url: string | null): string | null {
  if (!url) return null;
  try {
    const segs = new URL(url).pathname.split('/').filter(Boolean);
    return segs.length ? (segs[segs.length - 1] ?? null) : null;
  } catch {
    return null;
  }
}

/** Contenu d'une balise meta `og:`/`twitter:`/`product:` (ordre attribut indifférent). */
export function extractMeta(html: string, property: string): string | null {
  const p = property.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return (
    new RegExp(
      `<meta[^>]+(?:property|name)=["']${p}["'][^>]+content=["']([^"']*)["']`,
      'i'
    ).exec(html)?.[1] ??
    new RegExp(
      `<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${p}["']`,
      'i'
    ).exec(html)?.[1] ??
    null
  );
}

/** Ville + code postal depuis un segment d'URL « ville-slug-63000 ». */
export function cityPostalFromUrl(url: string | null): {
  city: string | null;
  postalCode: string | null;
} {
  if (!url) return { city: null, postalCode: null };
  let segs: string[];
  try {
    segs = new URL(url).pathname.split('/').filter(Boolean);
  } catch {
    return { city: null, postalCode: null };
  }
  for (const seg of segs) {
    const m = /^(.+)-(\d{5})$/.exec(seg);
    if (m?.[1] && m[2]) {
      const city = m[1]
        .split('-')
        .map(t => t.charAt(0).toUpperCase() + t.slice(1))
        .join(' ');
      return { city, postalCode: m[2] };
    }
  }
  return { city: null, postalCode: null };
}

// Jetons à écarter d'une ville extraite d'un texte (verbes/prépositions/unités).
const CITY_STOP = new Set([
  'a',
  'à',
  'de',
  'du',
  'des',
  'la',
  'le',
  'les',
  'et',
  'en',
  'au',
  'aux',
  'sur',
  'vente',
  'vendre',
  'achat',
  'acheter',
  'location',
  'louer',
  'prix',
  'piece',
  'pieces',
  'pièce',
  'pièces',
  'm',
  'm2',
  'm²',
  // types de bien (souvent en tête de titre, à ne pas confondre avec la ville)
  'maison',
  'maisons',
  'appartement',
  'appartements',
  'appart',
  'studio',
  'terrain',
  'terrains',
  'villa',
  'immeuble',
  'local',
  'parking',
  'garage',
  'box',
  'duplex',
  'loft',
  'propriete',
  'fermette',
  'grange',
  'chalet',
  'mas',
  'pavillon',
  'longere',
  'bureau',
  'commerce',
]);

function cleanCity(raw: string): string | null {
  const toks = raw
    .split(/\s+/)
    .map(t => t.trim())
    .filter(t => t && !/^\d+$/.test(t) && !CITY_STOP.has(t.toLowerCase()));
  if (!toks.length) return null;
  return toks
    .map(t =>
      t.length <= 3 && t === t.toUpperCase()
        ? t
        : t.charAt(0).toUpperCase() + t.slice(1).toLowerCase()
    )
    .join(' ');
}

/**
 * Ville + code postal depuis un TEXTE « … {Ville} {63500} … » (titre/og:title de
 * type « … à vendre / acheter avensan 33480 »). Ne se déclenche que si un code à
 * 5 chiffres suit des lettres → pas de faux positif sur un prix « 23 000 € ».
 */
export function cityPostalFromText(text: string | null): {
  city: string | null;
  postalCode: string | null;
} {
  if (!text) return { city: null, postalCode: null };
  const m = /([\p{L}][\p{L}\s'’-]*?)\s+(\d{5})(?!\d)/u.exec(text);
  if (m?.[1] && m[2]) return { city: cleanCity(m[1]), postalCode: m[2] };
  return { city: null, postalCode: null };
}

/** Code département (2 car.) d'un code postal ou de la 1ʳᵉ séquence de 5 chiffres d'un texte/URL. */
export function deptOf(postalOrText: string | null): string | null {
  if (!postalOrText) return null;
  const m = /(?<!\d)(\d{5})(?!\d)/.exec(postalOrText);
  return m?.[1] ? m[1].slice(0, 2) : null;
}

/**
 * Filtre « périmètre » : l'élément (CP, ou texte/URL contenant un CP) appartient-il
 * aux départements demandés ? `departments` vide/absent = aucun filtre (full).
 * Si aucun CP n'est détecté, on NE filtre PAS ici (le post-filtre par CP exact tranche).
 */
export function inDepartments(
  postalOrText: string | null,
  departments: string[] | undefined
): boolean {
  if (!departments || departments.length === 0) return true;
  const d = deptOf(postalOrText);
  if (d == null) return true;
  return departments.includes(d);
}
