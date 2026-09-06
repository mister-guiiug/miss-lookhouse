-- ╔══════════════════════════════════════════════════════════════════════╗
-- ║ Miss LookHouse — 0013 — supprimer son compte, soi-même.               ║
-- ╚══════════════════════════════════════════════════════════════════════╝
--
-- POURQUOI. L'app héberge un projet immobilier personnel : recherches
-- nommées, annonces qualifiées, notes privées, notifications, journal
-- d'audit avec IP et user-agent. Jusqu'ici les réglages n'offraient que la
-- déconnexion et une réinitialisation LOCALE (`wipeLocal`), qui ne touche
-- que le miroir du navigateur — le compte et ses lignes restaient sur le
-- serveur, et l'effacement passait par un message au mainteneur.
--
-- CE QUE LA FONCTION FAIT, ET DANS QUEL ORDRE. L'ordre n'est pas cosmétique :
--
--   1. `saved_searches` D'ABORD. Sa suppression déclenche `lh_log_search()`
--      (0002), qui INSÈRE dans `audit_logs`. Si on laissait la cascade de
--      `auth.users` s'en charger, cet INSERT arriverait pendant la même
--      instruction que la disparition de l'utilisateur : `audit_logs.user_id`
--      référence `auth.users` et la vérification de clé étrangère, faite en
--      fin d'instruction, échouerait. On paye donc l'audit tant que le compte
--      existe encore.
--   2. Un BALAYAGE du catalogue, pas une liste en dur : toute table de
--      `public` portant une colonne `user_id` de type uuid. Une liste
--      recopiée oublie la table ajoutée après coup — c'est exactement comme
--      ça que `search_shares` (0006) s'était retrouvée hors de celle de 0002,
--      et 0012 a dû balayer pour la rattraper.
--   3. Les deux tables que le balayage ne peut pas voir, faute de colonne
--      `user_id` : `search_shares` (owner_id / shared_with) et `profiles`
--      (id). Les partages REÇUS partent aussi : ce sont des lignes qui
--      désignent l'utilisateur.
--   4. `audit_logs` EN DERNIER, une fois que plus rien ne peut en réécrire.
--      Sa clé étrangère est `on delete set null` : sans ce passage, la
--      cascade laisserait des lignes orphelines portant l'IP et le
--      user-agent — des données personnelles sans personne.
--   5. `auth.users`. La cascade GoTrue (identities, sessions,
--      refresh_tokens, mfa_factors…) fait le reste.
--
-- L'HYPOTHÈSE QUI RESTAIT À PROUVER. Qu'une fonction `security definer`
-- appartenant à `postgres` puisse supprimer une ligne d'`auth.users` sur un
-- projet HÉBERGÉ est documenté par Supabase, mais n'avait jamais été établi
-- sur ce parc. Sur Supabase, `postgres` n'est PAS superutilisateur (mesuré
-- par supabase/tests/rls_force_security_definer.test.sql, `rolsuper = false`)
-- et `auth.users` appartient à `supabase_auth_admin` : le droit de DELETE
-- doit donc lui avoir été accordé explicitement. C'est ce que mesure et
-- imprime `supabase/tests/delete_my_account.test.sql`, en CI, sur la même
-- pile que l'hébergé. Si ce droit venait à manquer, le repli est
-- l'anonymisation (le modèle de mister-doc, `anonymize_doctor`) — mais elle
-- laisserait une ligne dans `auth.users`, donc un compte.
--
-- PAS DE `security invoker`. Sous l'appelant, la RLS filtrerait chaque
-- DELETE (ce qui, ici, donnerait le bon résultat) mais `audit_logs` n'a
-- AUCUNE politique d'écriture ni de suppression, `search_shares` n'en a pas
-- pour les partages reçus, et `auth.users` est hors de portée du rôle
-- `authenticated`. La fonction s'exécute donc sous `postgres`, dont
-- l'attribut BYPASSRLS — et non le `security definer` en lui-même — franchit
-- la RLS (cf. 0012 et le commentaire de `lh_audit`).
--
-- Idempotent : rejouable sans effet de bord.

create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  t text;
begin
  -- Aucune session : rien à supprimer, et surtout pas « tout ». Un DELETE
  -- sans WHERE utile est le mode d'échec à ne jamais laisser possible.
  if v_uid is null then
    raise exception 'delete_my_account : aucune session.' using errcode = '42501';
  end if;

  -- 1. Les recherches, tant que le compte existe (trigger d'audit).
  delete from public.saved_searches where user_id = v_uid;

  -- 2. Balayage : toute table de `public` portant `user_id uuid`, sauf
  --    l'audit, gardé pour la fin.
  for t in
    select c.relname
    from pg_class c
    join pg_namespace ns on ns.oid = c.relnamespace
    join pg_attribute a
      on a.attrelid = c.oid
     and a.attname = 'user_id'
     and a.attnum > 0
     and not a.attisdropped
     and a.atttypid = 'uuid'::regtype
    where ns.nspname = 'public'
      and c.relkind = 'r'
      and c.relname <> 'audit_logs'
    order by c.relname
  loop
    execute format('delete from public.%I where user_id = $1', t) using v_uid;
  end loop;

  -- 3. Ce que le balayage ne voit pas : pas de colonne `user_id`.
  delete from public.search_shares
    where owner_id = v_uid or shared_with = v_uid;
  delete from public.profiles where id = v_uid;

  -- 4. L'audit en dernier : `on delete set null` en aurait fait des orphelins
  --    porteurs d'IP et de user-agent.
  delete from public.audit_logs where user_id = v_uid;

  -- 5. Le compte. La cascade emporte ce qui reste, côté `auth` comme ailleurs.
  delete from auth.users where id = v_uid;
end $$;

-- Propriétaire explicite : c'est SON attribut BYPASSRLS, et ses droits sur
-- `auth.users`, qui font marcher la fonction. Le laisser implicite rendrait
-- le comportement dépendant du rôle qui a appliqué la migration.
alter function public.delete_my_account() owner to postgres;

-- Supabase pose des droits par défaut sur les fonctions de `public` (anon,
-- authenticated, service_role) EN PLUS de l'EXECUTE accordé à PUBLIC par
-- PostgreSQL. Révoquer PUBLIC ne suffit donc pas : `anon` est nommé.
revoke all on function public.delete_my_account() from public;
revoke all on function public.delete_my_account() from anon;
grant execute on function public.delete_my_account() to authenticated;

comment on function public.delete_my_account() is
  'Efface toutes les lignes de l''appelant puis son compte dans auth.users. '
  'SECURITY DEFINER (propriétaire postgres) : audit_logs et search_shares '
  'n''ont pas de politique permettant à `authenticated` de faire le ménage, '
  'et auth.users lui est inaccessible. Réservée à `authenticated` ; sans '
  'session (auth.uid() null) elle lève 42501 plutôt que d''effacer au hasard. '
  'Voir supabase/tests/delete_my_account.test.sql.';
