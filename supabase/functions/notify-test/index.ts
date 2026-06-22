// ╔══════════════════════════════════════════════════════════════════════╗
// ║ Edge Function `notify-test` — envoie une notification de TEST à soi.    ║
// ║ Appelée par l'utilisateur (JWT, verify_jwt ACTIVÉ) depuis les réglages : ║
// ║ crée une notification pour SON propre compte puis déclenche son dispatch ║
// ║ immédiat via `notify` (webhook + web push), pour valider la chaîne de    ║
// ║ bout en bout et rendre visible le statut de livraison. N'envoie qu'à soi.║
// ╚══════════════════════════════════════════════════════════════════════╝
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { cors, json } from '../_shared/cors.ts';
import { adminClient } from '../_shared/admin.ts';
import { fetchWithTimeout } from '../_shared/net.ts';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'POST attendu' }, 405);

  const url = Deno.env.get('SUPABASE_URL');
  const anon = Deno.env.get('SUPABASE_ANON_KEY');
  const ingestToken = Deno.env.get('INGEST_TOKEN');
  if (!url || !anon || !ingestToken)
    return json({ error: 'Configuration serveur incomplète.' }, 500);

  // Résout l'appelant via son JWT (verify_jwt activé au déploiement).
  const userClient = createClient(url, anon, {
    global: {
      headers: { Authorization: req.headers.get('Authorization') ?? '' },
    },
    auth: { persistSession: false },
  });
  const {
    data: { user },
  } = await userClient.auth.getUser();
  if (!user) return json({ error: 'Non autorisé.' }, 401);

  // Crée la notification de test (service_role) pour SON compte uniquement.
  const supabase = adminClient();
  const { data: inserted, error: insErr } = await supabase
    .from('notifications')
    .insert({
      user_id: user.id,
      type: 'important_change',
      title: '🔔 Notification de test',
      body: 'Si vous recevez ceci, vos notifications fonctionnent.',
    })
    .select('id')
    .single();
  if (insErr || !inserted)
    return json(
      { error: `Création échouée : ${insErr?.message ?? 'inconnue'}.` },
      500
    );

  // Déclenche le dispatch immédiat de CETTE notification via `notify`
  // (gated par INGEST_TOKEN ; notify écrit dispatched_at + delivery).
  let dispatch: unknown = null;
  try {
    const res = await fetchWithTimeout(
      `${url}/functions/v1/notify`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          Authorization: `Bearer ${ingestToken}`,
        },
        body: JSON.stringify({ notificationId: inserted.id }),
      },
      12000
    );
    dispatch = await res.json().catch(() => null);
  } catch (e) {
    return json({
      ok: false,
      notificationId: inserted.id,
      error: `Dispatch échoué : ${e instanceof Error ? e.message : 'réseau'}.`,
    });
  }

  return json({ ok: true, notificationId: inserted.id, dispatch });
});
