/**
 * Similarité d'images par hash perceptuel (dHash). Le calcul image→matrice
 * (décodage, niveaux de gris, redimensionnement 9×8) est dépendant de la
 * plateforme (Canvas côté navigateur, lib côté Edge) ; on isole ici la partie
 * PURE : construction du dHash depuis une matrice de gris, et distance de
 * Hamming entre empreintes hex.
 */

/**
 * dHash 64 bits depuis une matrice de luminance de 9 colonnes × 8 lignes
 * (longueur 72, ligne par ligne). Compare chaque pixel à son voisin de droite.
 * Retourne 16 caractères hexadécimaux.
 */
export function dHashFromGray9x8(gray: number[]): string {
  if (gray.length !== 72) {
    throw new Error('dHashFromGray9x8 attend 72 valeurs (9×8).');
  }
  let bits = '';
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const left = gray[row * 9 + col];
      const right = gray[row * 9 + col + 1];
      if (left === undefined || right === undefined) {
        bits += '0';
        continue;
      }
      bits += left < right ? '1' : '0';
    }
  }
  // 64 bits → 16 hex.
  let hex = '';
  for (let i = 0; i < 64; i += 4) {
    hex += parseInt(bits.slice(i, i + 4), 2).toString(16);
  }
  return hex;
}

const POPCOUNT: number[] = Array.from({ length: 16 }, (_, i) => {
  let n = i;
  let c = 0;
  while (n) {
    c += n & 1;
    n >>= 1;
  }
  return c;
});

/** Distance de Hamming entre deux empreintes hex de même longueur (0..bits). */
export function hammingHex(a: string, b: string): number {
  if (a.length !== b.length) return Number.POSITIVE_INFINITY;
  let dist = 0;
  for (let i = 0; i < a.length; i++) {
    const na = parseInt(a[i] ?? '0', 16);
    const nb = parseInt(b[i] ?? '0', 16);
    if (Number.isNaN(na) || Number.isNaN(nb)) return Number.POSITIVE_INFINITY;
    dist += POPCOUNT[na ^ nb] ?? 0;
  }
  return dist;
}

/**
 * Similarité d'images 0..1 entre deux jeux d'empreintes : on prend la MEILLEURE
 * paire (distance de Hamming minimale) et on la convertit en similarité.
 * Retourne null si l'un des jeux est vide (non comparable).
 */
export function imageSimilarity(
  a: string[] | null | undefined,
  b: string[] | null | undefined,
  bits = 64
): number | null {
  if (!a || !b || a.length === 0 || b.length === 0) return null;
  let best = Number.POSITIVE_INFINITY;
  for (const ha of a) {
    for (const hb of b) {
      const d = hammingHex(ha, hb);
      if (d < best) best = d;
    }
  }
  if (!Number.isFinite(best)) return null;
  return Math.max(0, 1 - best / bits);
}
