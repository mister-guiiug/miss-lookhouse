// ╔══════════════════════════════════════════════════════════════════════╗
// ║ Edge Function `notify` — dispatch des notifications vers les canaux.    ║
// ║ Gated par INGEST_TOKEN. Service role côté serveur uniquement.          ║
// ║                                                                        ║
// ║ DISPATCH-ONCE : ne traite QUE les notifications `dispatched_at IS NULL`,║
// ║ puis les estampille `dispatched_at = now()` → aucune ne part deux fois  ║
// ║ (cf. migration 0005). `read_at` reste l'état de lecture in-app, distinct.║
// ║                                                                        ║
// ║ Canaux : WEBHOOK (Telegram/Slack) + WEB PUSH (VAPID, via npm:web-push)  ║
// ║ + E-MAIL (API HTTP compatible Resend, opt-in par utilisateur, 0017).    ║
// ║ La clé VAPID privée et la clé d'API e-mail sont des secrets d'Edge      ║
// ║ Function. Sans les secrets e-mail, le canal est `skipped`, jamais en    ║
// ║ échec. La partie PURE du canal e-mail (qui, quoi, quel statut) vit dans ║
// ║ src/notify/, testée par vitest, copiée dans _shared/core/notify/.       ║
// ╚══════════════════════════════════════════════════════════════════════╝
import webpush from 'npm:web-push@3.6.7';
import { cors, json } from '../_shared/cors.ts';
import { adminClient, checkCronToken } from '../_shared/admin.ts';
import { fetchWithTimeout } from '../_shared/net.ts';
import {
  buildEmailRequest,
  composeNotificationEmail,
  decideEmail,
  emailStatusFromHttp,
  readEmailSetup,
  type EmailRecipient,
} from '../_shared/core/notify/email.ts';
import {
  statusFromCounts,
  type ChannelStatus,
  type DeliverySummary,
} from '../_shared/core/notify/delivery.ts';

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
interface Prefs {
  webhook_url: string | null;
  webpush_enabled: boolean;
  email_enabled: boolean;
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

// E-mail : EMAIL_API_KEY + EMAIL_FROM (+ EMAIL_API_URL, APP_URL facultatifs).
const EMAIL_SETUP = readEmailSetup(name => Deno.env.get(name));

// Resend accepte 2 requêtes par seconde par défaut : au-delà, 429 — et un
// e-mail refusé pour cadence serait perdu (dispatch-once). On espace donc.
const EMAIL_MIN_GAP_MS = 550;
let lastEmailAt = 0;
async function emailThrottle(): Promise<void> {
  const wait = lastEmailAt + EMAIL_MIN_GAP_MS - Date.now();
  if (wait > 0) await new Promise(r => setTimeout(r, wait));
  lastEmailAt = Date.now();
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
    return json({ candidates: 0, webhookSent: 0, pushSent: 0, emailSent: 0 });

  // Caches par utilisateur (évite N requêtes redondantes).
  const prefsCache = new Map<string, Prefs | null>();
  const getPrefs = async (userId: string) => {
    if (prefsCache.has(userId)) return prefsCache.get(userId) ?? null;
    const { data: prefs } = await supabase
      .from('notification_preferences')
      .select('webhook_url, webpush_enabled, email_enabled')
      .eq('user_id', userId)
      .maybeSingle();
    prefsCache.set(userId, (prefs as Prefs | null) ?? null);
    return (prefs as Prefs | null) ?? null;
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
  // L'adresse du COMPTE du destinataire, et si elle est confirmée : lue dans
  // auth.users par l'API d'administration, jamais copiée en base.
  const accountCache = new Map<string, EmailRecipient | null>();
  const getAccount = async (userId: string) => {
    if (accountCache.has(userId)) return accountCache.get(userId) ?? null;
    const { data: res, error: accErr } =
      await supabase.auth.admin.getUserById(userId);
    const account: EmailRecipient | null =
      accErr || !res?.user
        ? null
        : {
            email: res.user.email ?? null,
            email_confirmed_at: res.user.email_confirmed_at ?? null,
          };
    accountCache.set(userId, account);
    return account;
  };

  const dispatchedAt = new Date().toISOString();
  let webhookSent = 0;
  let pushSent = 0;
  let emailSent = 0;
  const processedIds: string[] = [];
  const deliveryById = new Map<string, DeliverySummary>();

  for (const n of notifs) {
    const prefs = await getPrefs(n.user_id);
    let webhook: ChannelStatus = 'skipped';
    let push: ChannelStatus = 'skipped';
    let email: ChannelStatus = 'skipped';
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
        push = statusFromCounts(nPushSent, nPushFailed);
        pushSent += nPushSent;
      }
    }

    // — Canal E-MAIL (opt-in, adresse du compte confirmée) —
    // Le compte n'est lu que si la personne a demandé l'e-mail ET que le
    // serveur sait écrire : ni appel d'administration ni adresse manipulée
    // pour rien.
    const optedIn = Boolean(prefs?.email_enabled);
    const account =
      optedIn && EMAIL_SETUP.state === 'ready'
        ? await getAccount(n.user_id)
        : null;
    const decision = decideEmail(optedIn, EMAIL_SETUP, account);
    if (decision.send && EMAIL_SETUP.state === 'ready') {
      const message = composeNotificationEmail(
        {
          id: n.id,
          title: n.title,
          body: n.body,
          listingId: n.listing_id,
        },
        EMAIL_SETUP.config.appUrl
      );
      const request = buildEmailRequest(
        EMAIL_SETUP.config,
        decision.to,
        message,
        n.id
      );
      try {
        await emailThrottle();
        const res = await fetchWithTimeout(request.url, request.init);
        await res.body?.cancel();
        email = emailStatusFromHttp(res.status);
      } catch (_e) {
        // Fournisseur injoignable : comme le webhook, on estampille quand
        // même — un e-mail en échec n'est pas une notification à rejouer.
        email = 'failed';
      }
      if (email === 'sent') emailSent++;
    } else if (!decision.send) {
      email = decision.status;
    }

    deliveryById.set(n.id, {
      at: dispatchedAt,
      channels: { webhook, push, email },
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
    emailSent,
    dispatched: processedIds.length,
  });
});
