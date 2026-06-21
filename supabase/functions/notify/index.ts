// ╔══════════════════════════════════════════════════════════════════════╗
// ║ Edge Function `notify` — dispatch des notifications vers les canaux.    ║
// ║ Gated par INGEST_TOKEN. Service role côté serveur uniquement.          ║
// ║                                                                        ║
// ║ Implémenté : canal WEBHOOK (Telegram/Slack/Discord — POST simple).     ║
// ║ À DURCIR : Web Push (signature VAPID ES256 + chiffrement aes128gcm) et  ║
// ║ e-mail (via fournisseur SMTP/API). Stubs explicites ci-dessous : on     ║
// ║ n'invente pas une implémentation Web Push non vérifiée.                 ║
// ╚══════════════════════════════════════════════════════════════════════╝
import { cors, json } from '../_shared/cors.ts';
import { adminClient, checkCronToken } from '../_shared/admin.ts';

interface Body {
  notificationId?: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (!checkCronToken(req)) return json({ error: 'Non autorisé.' }, 401);

  const supabase = adminClient();
  const body = (await req.json().catch(() => ({}))) as Body;

  // Sélectionne les notifications à dispatcher (ici : non lues, récentes).
  let query = supabase
    .from('notifications')
    .select('id, user_id, type, title, body')
    .is('read_at', null)
    .order('created_at', { ascending: false })
    .limit(50);
  if (body.notificationId)
    query = supabase
      .from('notifications')
      .select('id, user_id, type, title, body')
      .eq('id', body.notificationId);

  const { data: notifs, error } = await query;
  if (error) return json({ error: error.message }, 500);

  let webhookSent = 0;
  for (const n of notifs ?? []) {
    const { data: prefs } = await supabase
      .from('notification_preferences')
      .select('webhook_url, webpush_enabled, email_enabled')
      .eq('user_id', n.user_id)
      .maybeSingle();

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
        // journalisé en V2 dans ingestion_events / audit
      }
    }

    // — Canal WEB PUSH (à implémenter, VAPID requis) —
    // if (prefs?.webpush_enabled) { await sendWebPush(supabase, n); }

    // — Canal EMAIL (à implémenter, fournisseur SMTP/API) —
    // if (prefs?.email_enabled) { await sendEmail(n); }
  }

  return json({ candidates: notifs?.length ?? 0, webhookSent });
});
