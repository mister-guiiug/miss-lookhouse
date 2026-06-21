// @generated par scripts/build-edge-core.mjs — NE PAS ÉDITER.
// Source : src/ingestion/fieldMap.ts · Régénérer : npm run build:edge-core

/**
 * Outils PURS de mappage d'une réponse d'API autorisée vers le schéma d'import.
 * Aucune I/O : un connecteur `authorized_api` récupère le JSON officiel, puis
 * APPLIQUE ce mappage avant de passer par `parseListings` — donc la MÊME
 * normalisation que l'import manuel (cohérence front ↔ Edge garantie).
 */

/** Descend une valeur par chemin pointé : « a.b.0.c » (objets + index de tableau). */
export function getByPath(source: unknown, path: string): unknown {
  if (!path) return source;
  let cur: unknown = source;
  for (const seg of path.split('.')) {
    if (cur == null) return undefined;
    if (Array.isArray(cur)) {
      const i = Number(seg);
      cur = Number.isInteger(i) ? cur[i] : undefined;
    } else if (typeof cur === 'object') {
      cur = (cur as Record<string, unknown>)[seg];
    } else {
      return undefined;
    }
  }
  return cur;
}

/** Mappage « champ canonique → chemin dans la réponse ». */
export type FieldMap = Record<string, string>;

/**
 * Applique un mappage champ→chemin sur un item brut. Sans mappage (ou vide),
 * renvoie l'item tel quel (la réponse est supposée déjà proche du schéma).
 * Les chemins introuvables sont ignorés (pas de clé `undefined` injectée).
 */
export function applyFieldMap(
  item: unknown,
  map?: FieldMap | null
): Record<string, unknown> {
  if (!map || Object.keys(map).length === 0) {
    return item && typeof item === 'object'
      ? (item as Record<string, unknown>)
      : {};
  }
  const out: Record<string, unknown> = {};
  for (const [target, path] of Object.entries(map)) {
    const value = getByPath(item, path);
    if (value !== undefined) out[target] = value;
  }
  return out;
}

/**
 * Extrait le tableau d'items d'une charge utile. `listPath` optionnel pointe le
 * tableau (« results », « data.items »…) ; sinon on prend la racine si c'est un
 * tableau, ou on enveloppe un objet seul. Jamais d'exception : renvoie `[]`.
 */
export function pickItems(
  payload: unknown,
  listPath?: string | null
): unknown[] {
  const node = listPath ? getByPath(payload, listPath) : payload;
  if (Array.isArray(node)) return node;
  if (node == null) return [];
  return [node];
}
