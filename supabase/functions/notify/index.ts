// ╔══════════════════════════════════════════════════════════════════════╗
// ║ Edge Function `notify` — dispatch des notifications vers les canaux.    ║
// ║ Gated par INGEST_TOKEN. Service role côté serveur uniquement.          ║
// ║                                                                        ║
// ║ DISPATCH-ONCE : ne traite QUE les notifications `dispatched_at IS NULL`,║
// ║ puis les estampille `dispatched_at = now()` → aucune ne part deux fois  ║
// ║ (cf. migration 0005). `read_at` reste l'état de lecture in-app, distinct.║
// ║                                                                        ║
// ║ Canaux : WEBHOOK (Telegram/Slack) + WEB PUSH (VAPID, via npm:web-push). ║
// ║ La clé VAPID privée est un secret d'Edge Function. E-mail : à brancher. ║
// ╚══════════════════════════════════════════════════════════════════════╝
import webpush from 'npm:web-push@3.6.7';
import { cors, json } from '../_shared/cors.ts';
import { adminClient, checkCronToken } from '../_shared/admin.ts';
import { fetchWithTimeout } from '../_shared/net.ts';

interface Body {
  notificationId?: string;
}
interface NotifRow {
  id: string;
  user_id: string;
  title: string;
  body: string | null;
  listing_id: string | null;
}
interface PushSub {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

// VAPID : clés publiques/privées + sujet (mailto). Push actif seulement si présentes.
const VAPID_PUBLIC = Deno.env.get('VAPID_PUBLIC_KEY');
const VAPID_PRIVATE = Deno.env.get('VAPID_PRIVATE_KEY');
const VAPID_SUBJECT =
  Deno.env.get('VAPID_SUBJECT') ?? 'mailto:admin@miss-lookhouse.app';
const PUSH_READY = Boolean(VAPID_PUBLIC && VAPID_PRIVATE);
if (PUSH_READY) {
  webpush.setVapidDetails(
    VAPID_SUBJECT,
    VAPID_PUBLIC as string,
    VAPID_PRIVATE as string
  );
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (!checkCronToken(req)) return json({ error: 'Non autorisé.' }, 401);

  const supabase = adminClient();
  const body = (await req.json().catch(() => ({}))) as Body;

  let query = supabase
    .from('notifications')
    .select('id, user_id, title, body, listing_id')
    .order('created_at', { ascending: true })
    .limit(200);
  // DISPATCH-ONCE même par id : on ne (re)traite qu'une notification NON encore
  // dispatchée (notify-test crée toujours une notif fraîche → dispatchée une fois).
  query = body.notificationId
    ? query.eq('id', body.notificationId).is('dispatched_at', null)
    : query.is('dispatched_at', null);

  const { data, error } = await query;
  if (error) return json({ error: error.message }, 500);
  const notifs = (data ?? []) as NotifRow[];
  if (notifs.length === 0)
    return json({ candidates: 0, webhookSent: 0, pushSent: 0 });

  // Caches par utilisateur (évite N requêtes redondantes).
  const prefsCache = new Map<
    string,
    { webhook_url: string | null; webpush_enabled: boolean } | null
  >();
  const getPrefs = async (userId: string) => {
    if (prefsCache.has(userId)) return prefsCache.get(userId) ?? null;
    const { data: prefs } = await supabase
      .from('notification_preferences')
      .select('webhook_url, webpush_enabled')
      .eq('user_id', userId)
      .maybeSingle();
    prefsCache.set(userId, prefs ?? null);
    return prefs ?? null;
  };
  const subsCache = new Map<string, PushSub[]>();
  const getSubs = async (userId: string) => {
    if (subsCache.has(userId)) return subsCache.get(userId) as PushSub[];
    const { data: subs } = await supabase
      .from('push_subscriptions')
      .select('id, endpoint, p256dh, auth')
      .eq('user_id', userId);
    const list = (subs ?? []) as PushSub[];
    subsCache.set(userId, list);
    return list;
  };

  // Statut de livraison par canal (persisté dans notifications.delivery, cf. 0009).
  type ChannelStatus =
    | 'sent'
    | 'partial'
    | 'failed'
    | 'skipped'
    | 'no_subscription';
  interface Delivery {
    at: string;
    channels: { webhook: ChannelStatus; push: ChannelStatus };
    pushSent: number;
    pushFailed: number;
  }

  const dispatchedAt = new Date().toISOString();
  let webhookSent = 0;
  let pushSent = 0;
  const processedIds: string[] = [];
  const deliveryById = new Map<string, Delivery>();

  for (const n of notifs) {
    const prefs = await getPrefs(n.user_id);
    let webhook: ChannelStatus = 'skipped';
    let push: ChannelStatus = 'skipped';
    let nPushSent = 0;
    let nPushFailed = 0;

    // — Canal WEBHOOK —
    if (prefs?.webhook_url) {
      try {
        const res = await fetchWithTimeout(prefs.webhook_url, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ text: `${n.title} — ${n.body ?? ''}` }),
        });
        webhook = res.ok ? 'sent' : 'failed';
      } catch (_e) {
        // Webhook cassé : ne bloque pas l'estampillage (anti-boucle).
        webhook = 'failed';
      }
      if (webhook === 'sent') webhookSent++;
    }

    // — Canal WEB PUSH (VAPID) —
    if (PUSH_READY && prefs?.webpush_enabled) {
      const subs = await getSubs(n.user_id);
      if (subs.length === 0) {
        push = 'no_subscription';
      } else {
        const payload = JSON.stringify({
          title: n.title,
          body: n.body ?? '',
          url: n.listing_id
            ? `./#/annonces/${n.listing_id}`
            : './#/notifications',
          tag: n.id,
        });
        for (const sub of subs) {
          try {
            await webpush.sendNotification(
              {
                endpoint: sub.endpoint,
                keys: { p256dh: sub.p256dh, auth: sub.auth },
              },
              payload,
              { timeout: 8000 }
            );
            nPushSent++;
          } catch (e) {
            nPushFailed++;
            // 404/410 : abonnement expiré → on le supprime.
            const code =
              e && typeof e === 'object' && 'statusCode' in e
                ? (e as { statusCode: number }).statusCode
                : 0;
            if (code === 404 || code === 410) {
              await supabase
                .from('push_subscriptions')
                .delete()
                .eq('id', sub.id);
            }
          }
        }
        push =
          nPushFailed === 0 ? 'sent' : nPushSent === 0 ? 'failed' : 'partial';
        pushSent += nPushSent;
      }
    }

    deliveryById.set(n.id, {
      at: dispatchedAt,
      channels: { webhook, push },
      pushSent: nPushSent,
      pushFailed: nPushFailed,
    });
    processedIds.push(n.id);
  }

  // Estampillage + statut de livraison, par notification (volume horaire faible).
  if (processedIds.length > 0) {
    const results = await Promise.all(
      processedIds.map(id =>
        supabase
          .from('notifications')
          .update({
            dispatched_at: dispatchedAt,
            delivery: deliveryById.get(id),
          })
          .eq('id', id)
      )
    );
    const failed = results.find(r => r.error);
    if (failed?.error)
      return json(
        { error: `Estampillage échoué : ${failed.error.message}` },
        500
      );
  }

  return json({
    candidates: notifs.length,
    webhookSent,
    pushSent,
    dispatched: processedIds.length,
  });
});
