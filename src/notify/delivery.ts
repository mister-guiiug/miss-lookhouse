/**
 * Statut de livraison d'une notification, PAR CANAL — la forme de la colonne
 * `notifications.delivery` (migration 0009 ; le canal e-mail : 0017).
 *
 * Partagé tel quel par la fonction Edge `notify`, qui l'écrit (copie générée
 * dans `_shared/core/notify/`), et par l'app, qui le lit (`store/types.ts`) :
 * un seul vocabulaire des deux côtés.
 */

/**
 * - `sent` : remis au canal ;
 * - `partial` : remis à une partie des destinations (push multi-appareils) ;
 * - `failed` : tenté, et refusé ou injoignable ;
 * - `skipped` : non tenté — canal non demandé, ou non configuré sur le serveur ;
 * - `no_subscription` : push demandé, mais aucun appareil abonné.
 */
export type ChannelStatus =
  'sent' | 'partial' | 'failed' | 'skipped' | 'no_subscription';

/** Ce que `notify` range dans `notifications.delivery`. */
export interface DeliverySummary {
  at: string;
  channels: {
    webhook: ChannelStatus;
    push: ChannelStatus;
    email: ChannelStatus;
  };
  pushSent: number;
  pushFailed: number;
}

/**
 * Plusieurs envois pour un même canal (un par appareil abonné) → un statut.
 * Aucun envoi tenté n'est pas un échec : c'est `skipped`.
 */
export function statusFromCounts(sent: number, failed: number): ChannelStatus {
  if (sent + failed === 0) return 'skipped';
  if (failed === 0) return 'sent';
  return sent === 0 ? 'failed' : 'partial';
}
