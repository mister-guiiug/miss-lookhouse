-- ╔══════════════════════════════════════════════════════════════════════╗
-- ║ Miss LookHouse — Statut de livraison des notifications (par canal).     ║
-- ║                                                                        ║
-- ║ `delivery` (jsonb) résume le résultat du dispatch, écrit par `notify`   ║
-- ║ en même temps que `dispatched_at` :                                     ║
-- ║   { at, channels: { webhook, push }, pushSent, pushFailed }            ║
-- ║ où chaque canal vaut : sent | partial | failed | skipped |             ║
-- ║ no_subscription. Permet d'afficher dans l'app si une alerte a bien été  ║
-- ║ remise, et par quel canal — sans deviner.                              ║
-- ║                                                                        ║
-- ║ Écrit UNIQUEMENT par la fonction `notify` (service_role, hors RLS). Le  ║
-- ║ client le LIT via la policy select propriétaire existante mais ne       ║
-- ║ l'écrit JAMAIS — imposé techniquement par un GRANT de colonne ci-dessous.║
-- ╚══════════════════════════════════════════════════════════════════════╝

alter table notifications
  add column if not exists delivery jsonb;

comment on column notifications.delivery is
  'Résumé de livraison par canal (webhook/push), écrit par la fonction notify (service_role).';

-- ── Garde d'intégrité (niveau COLONNE) ─────────────────────────────────────
-- La policy owner UPDATE (0002) est au niveau LIGNE : sans restriction de
-- colonne, un client authentifié pourrait joindre `delivery`/`dispatched_at` à
-- son update légitime de `read_at` et ainsi forger son statut de livraison ou
-- casser l'invariant dispatch-once (file `dispatched_at IS NULL`). On scope donc
-- l'écriture client à la seule colonne `read_at`. Le `service_role` (utilisé par
-- `notify`) contourne RLS et GRANTs → il continue d'écrire delivery + dispatched_at.
revoke update on notifications from authenticated;
grant update (read_at) on notifications to authenticated;
