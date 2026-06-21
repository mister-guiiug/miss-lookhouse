/**
 * Abonnement Web Push (PWA). Disponible en mode Supabase, sur navigateur
 * compatible (Service Worker + PushManager) avec une clé VAPID publique.
 * La clé PRIVÉE VAPID est un secret d'Edge Function — jamais côté client.
 */
import { getSupabase } from '../backend/supabaseClient';
import { IS_SUPABASE } from '../backend/config';

const VAPID_PUBLIC = import.meta.env.VITE_VAPID_PUBLIC_KEY as
  | string
  | undefined;

/** Le Web Push est-il utilisable ici (mode + API navigateur + clé) ? */
export function pushSupported(): boolean {
  return (
    IS_SUPABASE &&
    Boolean(VAPID_PUBLIC) &&
    typeof navigator !== 'undefined' &&
    'serviceWorker' in navigator &&
    typeof window !== 'undefined' &&
    'PushManager' in window &&
    'Notification' in window
  );
}

/** Convertit une clé VAPID base64url en octets (applicationServerKey). */
export function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64);
  const arr = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

export async function getPushSubscription(): Promise<PushSubscription | null> {
  if (!pushSupported()) return null;
  const reg = await navigator.serviceWorker.ready;
  return reg.pushManager.getSubscription();
}

/** Demande la permission, s'abonne et enregistre l'abonnement (RLS owner). */
export async function enablePush(): Promise<{ ok: boolean; error?: string }> {
  if (!pushSupported()) return { ok: false, error: 'Push non supporté ici.' };
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') return { ok: false, error: 'Permission refusée.' };

  const reg = await navigator.serviceWorker.ready;
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC as string),
    }));
  const json = sub.toJSON();
  const keys = json.keys ?? {};
  if (!json.endpoint || !keys.p256dh || !keys.auth)
    return { ok: false, error: 'Abonnement incomplet.' };

  const s = getSupabase();
  if (!s) return { ok: false, error: 'Mode local.' };
  const {
    data: { user },
  } = await s.auth.getUser();
  if (!user) return { ok: false, error: 'Non connecté.' };

  const { error } = await s.from('push_subscriptions').upsert(
    {
      user_id: user.id,
      endpoint: json.endpoint,
      p256dh: keys.p256dh,
      auth: keys.auth,
      user_agent: navigator.userAgent,
    },
    { onConflict: 'endpoint' }
  );
  if (error) return { ok: false, error: error.message };
  await s
    .from('notification_preferences')
    .upsert(
      { user_id: user.id, webpush_enabled: true },
      { onConflict: 'user_id' }
    );
  return { ok: true };
}

/** Se désabonne (navigateur + base) et coupe la préférence. */
export async function disablePush(): Promise<{ ok: boolean; error?: string }> {
  const s = getSupabase();
  const sub = await getPushSubscription();
  if (sub) {
    const endpoint = sub.endpoint;
    await sub.unsubscribe().catch(() => {});
    if (s) await s.from('push_subscriptions').delete().eq('endpoint', endpoint);
  }
  if (s) {
    const {
      data: { user },
    } = await s.auth.getUser();
    if (user)
      await s
        .from('notification_preferences')
        .upsert(
          { user_id: user.id, webpush_enabled: false },
          { onConflict: 'user_id' }
        );
  }
  return { ok: true };
}
