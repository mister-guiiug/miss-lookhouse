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
