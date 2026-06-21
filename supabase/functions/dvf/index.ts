// ╔══════════════════════════════════════════════════════════════════════╗
// ║ Edge Function `dvf` — prix de référence au m² (open data DVF).         ║
// ║                                                                        ║
// ║ Pourquoi un proxy serveur : les fichiers geo-dvf (data.gouv.fr) n'ont  ║
// ║ PAS d'en-tête CORS et pèsent ~1 Mo/commune → infetchables depuis le    ║
// ║ navigateur. Cette fonction (authentifiée) résout la commune, télécharge ║
// ║ le CSV officiel, calcule une médiane €/m² ROBUSTE et la renvoie.       ║
// ║                                                                        ║
// ║ Source : « Demandes de valeurs foncières » (DGFiP), service public.    ║
// ╚══════════════════════════════════════════════════════════════════════╝
import { cors, json } from '../_shared/cors.ts';

// Années DVF tentées, de la plus récente à la plus ancienne.
const YEARS = [2024, 2023, 2022];
// Cache mémoire (par instance) : évite de retélécharger 1 Mo à chaque appel.
const cache = new Map<string, unknown>();

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'POST attendu' }, 405);

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const codePostal = String(body.codePostal ?? '').trim();
  const typeLocal = body.typeLocal ? String(body.typeLocal) : null;
  const city = body.city ? String(body.city) : null;
  if (!/^\d{5}$/.test(codePostal))
    return json({ error: 'codePostal invalide' }, 400);

  const insee = await resolveInsee(codePostal, city);
  if (!insee) return json({ count: 0, reason: 'commune introuvable' });

  const key = `${insee}|${typeLocal ?? 'all'}`;
  if (cache.has(key)) return json(cache.get(key));

  const dept = insee.startsWith('97') ? insee.slice(0, 3) : insee.slice(0, 2);
  for (const year of YEARS) {
    const url = `https://files.data.gouv.fr/geo-dvf/latest/csv/${year}/communes/${dept}/${insee}.csv`;
    let res: Response;
    try {
      res = await fetch(url, { redirect: 'follow' });
    } catch {
      continue;
    }
    if (!res.ok) {
      await res.body?.cancel();
      continue;
    }
    const csv = await res.text();
    const out = {
      insee,
      year,
      type: typeLocal,
      ...computeStats(csv, typeLocal),
    };
    cache.set(key, out);
    return json(out);
  }
  return json({ insee, count: 0, reason: 'aucune donnée DVF' });
});

/** Résout un code postal en code commune INSEE (gère Paris/Lyon/Marseille). */
async function resolveInsee(
  codePostal: string,
  city: string | null
): Promise<string | null> {
  const n = Number(codePostal);
  // Arrondissements : geo-dvf est clé par arrondissement, pas par commune-mère.
  if (n >= 75001 && n <= 75020) return String(75100 + (n - 75000)); // Paris
  if (n >= 69001 && n <= 69009) return String(69380 + (n - 69000)); // Lyon
  if (n >= 13001 && n <= 13016) return String(13200 + (n - 13000)); // Marseille

  try {
    const res = await fetch(
      `https://geo.api.gouv.fr/communes?codePostal=${codePostal}&fields=code,nom,population&format=json`
    );
    if (!res.ok) return null;
    const arr = (await res.json()) as Array<{
      code: string;
      nom: string;
      population?: number;
    }>;
    if (!Array.isArray(arr) || arr.length === 0) return null;
    const norm = (s: string) =>
      s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    if (city) {
      const m = arr.find(c => norm(c.nom) === norm(city));
      if (m) return m.code;
    }
    arr.sort((a, b) => (b.population ?? 0) - (a.population ?? 0));
    return arr[0].code;
  } catch {
    return null;
  }
}

/** Médiane + quartiles €/m² robustes depuis le CSV geo-dvf. */
function computeStats(csv: string, typeLocal: string | null) {
  const lines = csv.split('\n');
  if (lines.length < 2) return { count: 0, median: null, p25: null, p75: null };
  const header = lines[0].split(',');
  const cols = header.length;
  const iVf = header.indexOf('valeur_fonciere');
  const iSurf = header.indexOf('surface_reelle_bati');
  const iType = header.indexOf('type_local');
  if (iVf < 0 || iSurf < 0 || iType < 0)
    return { count: 0, median: null, p25: null, p75: null };

  const values: number[] = [];
  for (let k = 1; k < lines.length; k++) {
    const line = lines[k];
    if (!line) continue;
    const c = line.split(',');
    if (c.length !== cols) continue; // garde anti-désalignement CSV
    if (typeLocal && c[iType] !== typeLocal) continue;
    const vf = Number(c[iVf]);
    const surf = Number(c[iSurf]);
    if (!(vf > 0) || !(surf > 5)) continue;
    const ppm = vf / surf;
    if (ppm < 200 || ppm > 50000) continue; // bornes anti-aberrations
    values.push(ppm);
  }
  values.sort((a, b) => a - b);
  const q = (p: number) =>
    values.length
      ? Math.round(
          values[Math.min(values.length - 1, Math.floor(p * values.length))]
        )
      : null;
  return { count: values.length, median: q(0.5), p25: q(0.25), p75: q(0.75) };
}
