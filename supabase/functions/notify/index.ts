// ╔══════════════════════════════════════════════════════════════════════╗
// ║ Edge Function `notify` — dispatch des notifications vers les canaux.    ║
// ║ Gated par INGEST_TOKEN. Service role côté serveur uniquement.          ║
// ║                                                                        ║
// ║ DISPATCH-ONCE : ne traite QUE les notifications `dispatched_at IS NULL`,║
// ║ puis les estampille `dispatched_at = now()` → aucune ne part deux fois  ║
// ║ (cf. migration 0005). `read_at` reste l'état de lecture in-app, distinct.║
// ║                                                                        ║
// ║ Implémenté : canal WEBHOOK (Telegram/Slack/Discord). À DURCIR : Web Push║
// ║ (VAPID ES256 + aes128gcm) et e-mail — stubs explicites (rien d'inventé).║
// ╚══════════════════════════════════════════════════════════════════════╝
import { cors, json } from '../_shared/cors.ts';
import { adminClient, checkCronToken } from '../_shared/admin.ts';

interface Body {
  /** Forcer le re-dispatch d'une notification précise (debug/admin). */
  notificationId?: string;
}

interface NotifRow {
  id: string;
  user_id: string;
  title: string;
  body: string | null;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (!checkCronToken(req)) return json({ error: 'Non autorisé.' }, 401);

  const supabase = adminClient();
  const body = (await req.json().catch(() => ({}))) as Body;

  // Sélectionne les notifications NON dispatchées (ou une précise si demandée).
  let query = supabase
    .from('notifications')
    .select('id, user_id, title, body')
    .order('created_at', { ascending: true })
    .limit(200);
  query = body.notificationId
    ? query.eq('id', body.notificationId)
    : query.is('dispatched_at', null);

  const { data, error } = await query;
  if (error) return json({ error: error.message }, 500);
  const notifs = (data ?? []) as NotifRow[];
  if (notifs.length === 0) return json({ candidates: 0, webhookSent: 0 });

  // Cache des préférences par utilisateur (évite N requêtes redondantes).
  const prefsCache = new Map<string, { webhook_url: string | null } | null>();
  const getPrefs = async (userId: string) => {
    if (prefsCache.has(userId)) return prefsCache.get(userId) ?? null;
    const { data: prefs } = await supabase
      .from('notification_preferences')
      .select('webhook_url')
      .eq('user_id', userId)
      .maybeSingle();
    prefsCache.set(userId, prefs ?? null);
    return prefs ?? null;
  };

  let webhookSent = 0;
  const processedIds: string[] = [];
  for (const n of notifs) {
    const prefs = await getPrefs(n.user_id);

    // — Canal WEBHOOK (implémenté) —
    if (prefs?.webhook_url) {
      try {
        await fetch(prefs.webhook_url, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ text: `${n.title} — ${n.body ?? ''}` }),
        });
        webhookSent++;
      } catch (_e) {
        // L'erreur de webhook ne bloque pas l'estampillage : on évite une
        // boucle de re-dispatch infinie sur un webhook cassé.
      }
    }

    // — Web Push (VAPID) / e-mail : à implémenter (cf. en-tête). —

    processedIds.push(n.id);
  }

  // Estampille toutes les notifications traitées → dispatch-once.
  if (processedIds.length > 0) {
    const { error: upErr } = await supabase
      .from('notifications')
      .update({ dispatched_at: new Date().toISOString() })
      .in('id', processedIds);
    if (upErr)
      return json({ error: `Estampillage échoué : ${upErr.message}` }, 500);
  }

  return json({
    candidates: notifs.length,
    webhookSent,
    dispatched: processedIds.length,
  });
});
