-- Miss LookHouse — 0014 — les privilèges de table de `keep_alive`.
--
-- POURQUOI UNE MIGRATION DE PLUS, ALORS QUE `0011` FAIT DÉJÀ CE QU'IL FAUT.
-- `0011` crée la table, active la RLS et donne à `anon` une policy `select`.
-- C'est correct, et ce n'est qu'une moitié : une policy filtre des LIGNES, un
-- privilège de table autorise la COMMANDE. Les deux existent, et ils tombent
-- pour des raisons indépendantes — `0009_notification_delivery.sql` le sait
-- déjà, qui reprend `update` sur `notifications` pour ne le rendre que sur une
-- seule colonne.
--
-- CE QUE ÇA CHANGE CONCRÈTEMENT. Sur un projet Supabase, une table neuve de
-- `public` arrive avec INSERT, UPDATE, DELETE **et TRUNCATE** déjà accordés à
-- `anon` et `authenticated` (relevé le 13/09/2026 sur un projet du parc).
-- Seule la RLS les arrête — et elle ne les arrête pas tous : vérifié le même
-- jour, avec la RLS active et une unique policy `select`, un `truncate` passé
-- en rôle `anon` a VIDÉ la table sans rien violer. La RLS ne couvre pas
-- `truncate`, le privilège si.
--
-- Ce n'est pas une faille exploitable en l'état : PostgREST n'expose pas
-- `truncate`, et `anon` n'est pas un rôle de connexion. C'est une dépendance
-- cachée — aujourd'hui rien ne protège cette table qu'un `alter table … disable
-- row level security` fait un jour par commodité. Après ces deux lignes, il
-- faut défaire DEUX choses au lieu d'une.
--
-- `keep_alive` est la seule table du dépôt dont la policy dit `using (true)`
-- pour `anon` : c'est aussi la seule dont la surface ne dépend pas d'un
-- utilisateur connecté. Elle mérite la barrière en plus.
--
-- Rejouable sans effet de bord.

revoke all on table public.keep_alive from anon, authenticated;

-- Le ping anti-pause ne fait qu'un `select … limit 1` : c'est tout ce qu'on lui
-- rend, et à lui seul. `service_role` garde ses droits — c'est la voie
-- d'administration, et elle passe de toute façon outre la RLS.
grant select on table public.keep_alive to anon;
