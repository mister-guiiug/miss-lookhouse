/**
 * Prix de référence DVF (« Demandes de valeurs foncières », open data DGFiP).
 * Le fetch + calcul de médiane vit dans la fonction Edge `dvf` (les fichiers
 * geo-dvf n'ont pas de CORS et pèsent ~1 Mo) ; ici, on l'appelle et on compare.
 * Disponible uniquement en mode Supabase (utilisateur authentifié).
 */
import { getSupabase } from '../backend/supabaseClient';

export interface DvfReference {
  insee?: string;
  year?: number;
  type?: string | null;
  count: number;
  median: number | null;
  p25: number | null;
  p75: number | null;
  reason?: string;
}

/** Appelle la fonction Edge `dvf`. Renvoie null hors mode Supabase. */
export async function getDvfReference(params: {
  codePostal: string;
  typeLocal?: string | null;
  city?: string | null;
}): Promise<DvfReference | null> {
  const s = getSupabase();
  if (!s) return null;
  const { data, error } = await s.functions.invoke<DvfReference>('dvf', {
    body: params,
  });
  if (error) throw new Error(error.message ?? 'Service DVF indisponible.');
  return data ?? null;
}

/** Type de bien de l'app → type_local DVF (€/m² bâti pertinent seulement ici). */
export function toDvfType(
  propertyType?: string | null
): 'Appartement' | 'Maison' | null {
  if (!propertyType) return null;
  const p = propertyType.toLowerCase();
  if (p.includes('appart')) return 'Appartement';
  if (p.includes('maison')) return 'Maison';
  return null;
}

/** Écart de l'annonce vs la médiane de marché, en % (pour l'affichage). */
export function marketDelta(
  listingPerM2: number | null,
  median: number | null
): { pct: number; over: boolean } | null {
  if (!listingPerM2 || !median) return null;
  const pct = Math.round(((listingPerM2 - median) / median) * 100);
  return { pct, over: pct > 0 };
}
