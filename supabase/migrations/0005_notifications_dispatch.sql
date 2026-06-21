-- ╔══════════════════════════════════════════════════════════════════════╗
-- ║ Miss LookHouse — Dispatch-once des notifications (corrige le double envoi).║
-- ║                                                                        ║
-- ║ `dispatched_at` = horodatage d'envoi aux canaux (webhook/push/email),  ║
-- ║ distinct de `read_at` (lecture in-app par l'utilisateur). La fonction  ║
-- ║ `notify` ne traite QUE les notifications NON dispatchées puis les       ║
-- ║ estampille → chaque notification n'est envoyée qu'une seule fois.       ║
-- ╚══════════════════════════════════════════════════════════════════════╝

alter table notifications
  add column if not exists dispatched_at timestamptz;

-- Index partiel : la file d'envoi (non dispatchées) reste petite et rapide.
create index if not exists notifications_undispatched_idx
  on notifications (user_id)
  where dispatched_at is null;

-- L'estampillage est fait par la fonction `notify` (service_role, hors RLS) ;
-- le client n'écrit jamais `dispatched_at` (aucune politique ajoutée).
