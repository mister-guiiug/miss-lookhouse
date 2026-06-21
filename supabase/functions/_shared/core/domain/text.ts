// @generated par scripts/build-edge-core.mjs — NE PAS ÉDITER.
// Source : src/domain/text.ts · Régénérer : npm run build:edge-core

/**
 * Similarité textuelle pure et explicable : tokenisation, Jaccard sur jetons,
 * coefficient de Dice sur trigrammes de caractères. Combinaison des deux pour
 * être robuste aux reformulations ET aux fautes/variations.
 */
import { squashWhitespace, stripAccents } from './normalize.ts';

const STOPWORDS = new Set([
  'le',
  'la',
  'les',
  'un',
  'une',
  'des',
  'de',
  'du',
  'et',
  'a',
  'au',
  'aux',
  'en',
  'pour',
  'avec',
  'sur',
  'dans',
  'ce',
  'cet',
  'cette',
  'ses',
  'son',
  'sa',
  'plus',
  'tres',
  'tout',
  'toute',
  'par',
  'est',
  'vous',
  'votre',
]);

/** Découpe en jetons normalisés (sans accents, sans stopwords, longueur ≥ 2). */
export function tokenize(input: string | null | undefined): string[] {
  if (!input) return [];
  const cleaned = squashWhitespace(
    stripAccents(input).replace(/[^a-z0-9]+/g, ' ')
  );
  if (!cleaned) return [];
  return cleaned.split(' ').filter(t => t.length >= 2 && !STOPWORDS.has(t));
}

/** Indice de Jaccard sur deux ensembles de jetons : |A∩B| / |A∪B|. */
export function jaccard(a: string[], b: string[]): number {
  if (a.length === 0 && b.length === 0) return 1;
  if (a.length === 0 || b.length === 0) return 0;
  const setA = new Set(a);
  const setB = new Set(b);
  let inter = 0;
  for (const t of setA) if (setB.has(t)) inter++;
  const union = setA.size + setB.size - inter;
  return union === 0 ? 0 : inter / union;
}

/** Trigrammes de caractères d'une chaîne normalisée (avec marges). */
export function trigrams(input: string): Set<string> {
  const s = `  ${squashWhitespace(stripAccents(input))} `;
  const out = new Set<string>();
  for (let i = 0; i + 3 <= s.length; i++) {
    out.add(s.slice(i, i + 3));
  }
  return out;
}

/** Coefficient de Dice sur trigrammes : 2|A∩B| / (|A|+|B|). */
export function diceTrigrams(a: string, b: string): number {
  const ta = trigrams(a);
  const tb = trigrams(b);
  if (ta.size === 0 && tb.size === 0) return 1;
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const g of ta) if (tb.has(g)) inter++;
  return (2 * inter) / (ta.size + tb.size);
}

/**
 * Similarité textuelle combinée (0..1) sur titre + description.
 * Moyenne pondérée : 60 % Jaccard de jetons (sémantique grossière) +
 * 40 % Dice de trigrammes (robustesse aux variations).
 */
export function textSimilarity(
  aTitle: string | null | undefined,
  aDesc: string | null | undefined,
  bTitle: string | null | undefined,
  bDesc: string | null | undefined
): number {
  const aFull = `${aTitle ?? ''} ${aDesc ?? ''}`.trim();
  const bFull = `${bTitle ?? ''} ${bDesc ?? ''}`.trim();
  if (!aFull && !bFull) return 1;
  if (!aFull || !bFull) return 0;
  const jac = jaccard(tokenize(aFull), tokenize(bFull));
  const dice = diceTrigrams(aFull, bFull);
  return 0.6 * jac + 0.4 * dice;
}

/** Présence d'un mot-clé (insensible accents/casse) dans un texte. */
export function containsKeyword(haystack: string, keyword: string): boolean {
  const h = stripAccents(haystack);
  const k = stripAccents(keyword).trim();
  if (!k) return false;
  return h.includes(k);
}
