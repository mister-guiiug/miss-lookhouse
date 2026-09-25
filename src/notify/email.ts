/**
 * Le canal E-MAIL de la fonction Edge `notify` — sa partie PURE.
 *
 * POURQUOI ICI, DANS `src/`. Le dépôt ne teste pas ses fonctions Edge : pas de
 * Deno en CI, et `vitest` exclut `supabase/`. Ce qui DÉCIDE — faut-il écrire,
 * à qui, avec quel texte, quel statut en garder — vit donc ici, testé par
 * vitest, et `scripts/build-edge-core.mjs` le copie dans
 * `supabase/functions/_shared/core/notify/`, comme le reste du cœur partagé. La
 * fonction Edge ne garde que les entrées-sorties : lire l'environnement et la
 * base, appeler l'API d'envoi.
 *
 * L'API VISÉE est celle de Resend (`POST https://api.resend.com/emails`,
 * `Authorization: Bearer <clé>`), et tout fournisseur qui en reprend la forme :
 * `EMAIL_API_URL` la remplace. Trois secrets d'Edge Function la paramètrent,
 * posés par l'exploitant et jamais par le dépôt : `EMAIL_API_KEY`,
 * `EMAIL_FROM`, `EMAIL_API_URL` (facultatif). `APP_URL` (facultatif, public)
 * dit où pointe le lien du message.
 *
 * AUCUNE DONNÉE D'UN AUTRE UTILISATEUR. Le message ne se compose qu'à partir
 * de LA notification — qui appartient à son destinataire — et du lien vers
 * l'annonce ; l'adresse est celle du compte de ce même destinataire.
 */
import type { ChannelStatus } from './delivery';

export const DEFAULT_EMAIL_API_URL = 'https://api.resend.com/emails';

/** Le site déployé (GitHub Pages) : les liens du message y ramènent. */
export const DEFAULT_APP_URL =
  'https://mister-guiiug.github.io/miss-lookhouse/';

/** Les secrets et réglages lus dans l'environnement de la fonction. */
export interface EmailConfig {
  apiUrl: string;
  apiKey: string;
  from: string;
  appUrl: string;
}

/**
 * Trois états, parce que deux ne suffisent pas à bien nommer une panne :
 *   - `absent` : secrets non posés. C'est l'état par défaut du dépôt, pas une
 *     panne — le canal est IGNORÉ (`skipped`), jamais en échec ;
 *   - `invalid` : posés mais inutilisables (URL non https). Là, c'est une
 *     erreur d'exploitation, et elle doit se voir (`failed`) ;
 *   - `ready` : on peut écrire.
 */
export type EmailSetup =
  | { state: 'ready'; config: EmailConfig }
  | { state: 'absent' }
  | { state: 'invalid'; problem: string };

function httpsUrl(raw: string): URL | null {
  try {
    const u = new URL(raw);
    return u.protocol === 'https:' ? u : null;
  } catch {
    return null;
  }
}

/** Lit la configuration du canal. `env` = `Deno.env.get` côté Edge. */
export function readEmailSetup(
  env: (name: string) => string | undefined
): EmailSetup {
  const apiKey = env('EMAIL_API_KEY')?.trim();
  const from = env('EMAIL_FROM')?.trim();
  if (!apiKey || !from) return { state: 'absent' };

  const apiUrl = env('EMAIL_API_URL')?.trim() || DEFAULT_EMAIL_API_URL;
  if (!httpsUrl(apiUrl))
    return { state: 'invalid', problem: 'EMAIL_API_URL doit être en https.' };

  const app = httpsUrl(env('APP_URL')?.trim() || DEFAULT_APP_URL);
  if (!app) return { state: 'invalid', problem: 'APP_URL doit être en https.' };
  // Le lien se construit par concaténation du fragment (`#/annonces/…`) : la
  // base doit finir par « / », sans fragment ni requête.
  app.hash = '';
  app.search = '';
  const appUrl = app.href.endsWith('/') ? app.href : `${app.href}/`;

  return { state: 'ready', config: { apiUrl, apiKey, from, appUrl } };
}

/** L'état du compte destinataire, tel que le rend l'API d'administration. */
export interface EmailRecipient {
  email?: string | null;
  email_confirmed_at?: string | null;
}

export type EmailSkipReason =
  'not_opted_in' | 'not_configured' | 'invalid_config' | 'no_confirmed_address';

export type EmailDecision =
  | { send: true; to: string }
  | { send: false; status: ChannelStatus; reason: EmailSkipReason };

/**
 * Faut-il écrire ? L'ordre des questions est celui du bon sens : la personne
 * l'a-t-elle demandé, le serveur sait-il écrire, a-t-on une adresse VÉRIFIÉE.
 * Une adresse non confirmée n'est pas une adresse du compte : on n'y écrit pas.
 */
export function decideEmail(
  optedIn: boolean,
  setup: EmailSetup,
  recipient: EmailRecipient | null
): EmailDecision {
  if (!optedIn)
    return { send: false, status: 'skipped', reason: 'not_opted_in' };
  if (setup.state === 'absent')
    return { send: false, status: 'skipped', reason: 'not_configured' };
  if (setup.state === 'invalid')
    return { send: false, status: 'failed', reason: 'invalid_config' };
  const to = recipient?.email?.trim();
  if (!to || !recipient?.email_confirmed_at)
    return { send: false, status: 'skipped', reason: 'no_confirmed_address' };
  return { send: true, to };
}

/** Ce que le message dit de la notification — et rien d'autre. */
export interface NotificationForEmail {
  id: string;
  title: string;
  body: string | null;
  listingId: string | null;
}

export interface EmailMessage {
  subject: string;
  text: string;
  html: string;
}

/** Échappement HTML : titres et corps viennent d'annonces tierces. */
export function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Une ligne, sans sauts ni espaces en rafale, bornée (objet du message). */
function oneLine(input: string, max: number): string {
  const s = input.replace(/\s+/g, ' ').trim();
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

/** Le lien de l'annonce dans l'app (HashRouter), sinon le centre d'alertes. */
export function notificationLink(
  appUrl: string,
  listingId: string | null
): string {
  return listingId
    ? `${appUrl}#/annonces/${encodeURIComponent(listingId)}`
    : `${appUrl}#/notifications`;
}

/** Texte brut et HTML simple, avec le lien vers l'annonce. */
export function composeNotificationEmail(
  n: NotificationForEmail,
  appUrl: string
): EmailMessage {
  const title = oneLine(n.title || 'Nouvelle alerte', 140);
  const body = (n.body ?? '').trim();
  const link = notificationLink(appUrl, n.listingId);
  const settings = `${appUrl}#/reglages`;
  const action = n.listingId ? 'Voir l’annonce' : 'Ouvrir vos alertes';
  const why =
    'Vous recevez ce message parce que les alertes par e-mail sont activées ' +
    'sur votre compte Miss LookHouse. Pour les couper : Réglages › ' +
    'Notifications › E-mail.';

  const text = [
    title,
    '',
    ...(body ? [body, ''] : []),
    `${action} : ${link}`,
    '',
    '—',
    why,
    settings,
    '',
  ].join('\n');

  const bodyHtml = body
    ? `<p style="margin:0 0 16px">${escapeHtml(body).replace(/\r?\n/g, '<br>')}</p>`
    : '';
  const html = [
    '<!doctype html>',
    '<html lang="fr"><head><meta charset="utf-8"></head>',
    '<body style="margin:0;padding:24px;font-family:system-ui,-apple-system,Segoe UI,sans-serif;line-height:1.5;color:#0f172a;background:#ffffff">',
    `<h1 style="font-size:18px;margin:0 0 12px">${escapeHtml(title)}</h1>`,
    bodyHtml,
    `<p style="margin:0 0 24px"><a href="${escapeHtml(link)}" style="color:#0f766e;font-weight:600">${action}</a></p>`,
    '<hr style="border:none;border-top:1px solid #e2e8f0;margin:0 0 12px">',
    `<p style="font-size:12px;color:#475569;margin:0">${escapeHtml(why)} <a href="${escapeHtml(settings)}" style="color:#475569">Réglages</a></p>`,
    '</body></html>',
  ].join('');

  return { subject: `Miss LookHouse — ${title}`, text, html };
}

/** La requête HTTP d'envoi, prête pour `fetch` (forme Resend). */
export interface EmailRequest {
  url: string;
  init: {
    method: 'POST';
    headers: Record<string, string>;
    body: string;
  };
}

/**
 * `Idempotency-Key` : le dispatch-once de `notify` (0005) empêche déjà un
 * second envoi, mais pas celui d'un passage interrompu ENTRE l'envoi et
 * l'estampillage. Resend retient la clé 24 h et ignore le doublon.
 */
export function buildEmailRequest(
  config: EmailConfig,
  to: string,
  message: EmailMessage,
  notificationId: string
): EmailRequest {
  return {
    url: config.apiUrl,
    init: {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': `miss-lookhouse-notification-${notificationId}`,
      },
      body: JSON.stringify({
        from: config.from,
        to: [to],
        subject: message.subject,
        text: message.text,
        html: message.html,
      }),
    },
  };
}

/** Réponse du fournisseur → statut du canal : tout ce qui n'est pas 2xx échoue. */
export function emailStatusFromHttp(status: number): ChannelStatus {
  return status >= 200 && status < 300 ? 'sent' : 'failed';
}
