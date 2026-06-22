// ╔══════════════════════════════════════════════════════════════════════╗
// ║ Edge Function `connector-test` — DRY-RUN d'un connecteur authorized_api.║
// ║ Appelée par l'utilisateur (JWT) depuis l'écran connecteurs : récupère, ║
// ║ mappe et normalise un échantillon SANS RIEN ÉCRIRE en base. Permet de   ║
// ║ valider URL + listPath + mappage avant de programmer la collecte.       ║
// ║ Réutilise la garde anti-SSRF + le cœur de normalisation (B1).          ║
// ╚══════════════════════════════════════════════════════════════════════╝
import { cors, json } from '../_shared/cors.ts';
import { assertPublicHttpsUrl, fetchWithTimeout } from '../_shared/net.ts';
import { parseListings } from '../_shared/core/ingestion/schema.ts';
import {
  applyFieldMap,
  pickItems,
} from '../_shared/core/ingestion/fieldMap.ts';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'POST attendu' }, 405);

  let cfg: Record<string, unknown> = {};
  try {
    cfg = (await req.json()) as Record<string, unknown>;
  } catch {
    return json({ error: 'Corps JSON invalide.' });
  }

  const url = typeof cfg.url === 'string' ? cfg.url : '';
  try {
    await assertPublicHttpsUrl(url);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'URL invalide.' });
  }

  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...((cfg.headers as Record<string, string>) ?? {}),
  };
  if (typeof cfg.secretRef === 'string' && cfg.secretRef) {
    const secret = Deno.env.get(cfg.secretRef);
    if (secret) {
      const h = (cfg.authHeader as string) ?? 'Authorization';
      const scheme = (cfg.authScheme as string) ?? 'Bearer';
      headers[h] = scheme ? `${scheme} ${secret}` : secret;
    }
  }

  let res: Response;
  try {
    res = await fetchWithTimeout(
      url,
      { method: (cfg.method as string) ?? 'GET', headers },
      10000
    );
  } catch (e) {
    return json({
      error: `Échec de l'appel : ${e instanceof Error ? e.message : 'réseau'}.`,
    });
  }
  if (!res.ok) return json({ error: `Réponse HTTP ${res.status}.` });

  let payload: unknown;
  try {
    payload = await res.json();
  } catch {
    return json({ error: 'La réponse n’est pas du JSON.' });
  }

  const items = pickItems(payload, cfg.listPath as string | undefined);
  const map = cfg.map as Record<string, string> | undefined;
  const raws = items
    .slice(0, 5)
    .map(it => ({ ...applyFieldMap(it, map), sourceId: 'test' }));
  const { listings, errors } = parseListings(raws);

  return json({
    count: items.length,
    sample: listings.map(l => ({
      externalId: l.externalId,
      title: l.title,
      price: l.price,
      city: l.city,
      surfaceM2: l.surfaceM2,
    })),
    errors,
  });
});
