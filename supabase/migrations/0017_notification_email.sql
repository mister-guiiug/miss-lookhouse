-- ╔══════════════════════════════════════════════════════════════════════╗
-- ║ Miss LookHouse — 0017 — le canal E-MAIL de `notify` : ce que la base   ║
-- ║ en porte.                                                              ║
-- ╚══════════════════════════════════════════════════════════════════════╝
--
-- PRESQUE RIEN, ET C'EST VOULU. Le canal e-mail de la fonction Edge `notify`
-- ne demande aucune colonne neuve :
--
--   · l'OPT-IN existe depuis 0001 : `notification_preferences.email_enabled`,
--     `false` par défaut. L'utilisateur le pose lui-même depuis les Réglages,
--     sur SA ligne (politiques propriétaire de 0002) ;
--   · l'ADRESSE est celle du compte, lue par `notify` dans `auth.users` via
--     l'API d'administration (service_role), et seulement si elle est
--     CONFIRMÉE. Aucune copie n'en est faite en base ;
--   · le STATUT de livraison (0009) est un `jsonb` : il gagne
--     `channels.email` sans changement de schéma — `sent`, `failed`, ou
--     `skipped` (non demandé, secrets absents, adresse non confirmée).
--
-- Cette migration met donc la documentation de la base à jour — les
-- commentaires que lit quiconque ouvre le tableau de bord — et
-- `supabase/tests/notification_email.test.sql` épingle le contrat dont le
-- canal dépend : opt-in à `false` par défaut, écrit par son seul
-- propriétaire, statut de livraison non écrivable par le client.
--
-- Rejouable : `comment on` remplace.

comment on column public.notifications.delivery is
  'Résumé de livraison par canal, écrit par la fonction notify (service_role) : '
  '{ at, channels: { webhook, push, email }, pushSent, pushFailed }. Statuts : '
  'sent | partial | failed | skipped | no_subscription. Non écrivable par le '
  'client (grant de colonne de 0009).';

comment on column public.notification_preferences.email_enabled is
  'Opt-in aux alertes par e-mail (défaut false), posé par l''utilisateur dans '
  'les Réglages. L''adresse est celle du compte (auth.users), confirmée. Sans '
  'les secrets EMAIL_API_KEY / EMAIL_FROM de la fonction notify, le canal '
  'reste « skipped ». Voir 0017.';
