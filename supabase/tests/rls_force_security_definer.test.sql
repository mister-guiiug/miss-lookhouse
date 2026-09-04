-- ╔══════════════════════════════════════════════════════════════════════╗
-- ║ Miss LookHouse — FORCE ROW LEVEL SECURITY × SECURITY DEFINER.         ║
-- ║                                                                        ║
-- ║ CE QUE CE TEST TRANCHE. 0002 pose `force row level security` sur les   ║
-- ║ tables ET écrit dans `audit_logs` depuis des fonctions                 ║
-- ║ `security definer`. Les deux choix se contredisent en théorie :        ║
-- ║ `force` soumet le PROPRIÉTAIRE des tables aux politiques, et une       ║
-- ║ fonction `security definer` s'exécute justement sous ce propriétaire.  ║
-- ║ Or `audit_logs` n'a AUCUNE politique d'écriture.                       ║
-- ║                                                                        ║
-- ║ Sauf que l'attribut de rôle BYPASSRLS, s'il est présent, l'emporte sur ║
-- ║ `force`. Lequel des deux gagne ici ne se déduit pas — il s'observe.    ║
-- ║ Les `diag()` de la section 1 impriment les faits ; les assertions de   ║
-- ║ la section 3 vérifient le seul constat qui compte : la ligne d'audit   ║
-- ║ est-elle RÉELLEMENT écrite quand un utilisateur authentifié agit ?     ║
-- ║                                                                        ║
-- ║ Le mode d'échec redouté n'est pas l'erreur : c'est le silence. Une     ║
-- ║ lecture bloquée par la RLS ne lève rien, elle rend zéro ligne. On      ║
-- ║ compte donc les lignes, on ne se contente jamais de « ça n'a pas       ║
-- ║ planté ».                                                              ║
-- ╚══════════════════════════════════════════════════════════════════════╝

create extension if not exists pgtap with schema extensions;

set search_path to public, extensions;

begin;

select plan(15);

-- ── Deux comptes de test (rollback en fin de fichier) ─────────────────────
insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
values
  (
    '11111111-1111-1111-1111-111111111111',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'alice@example.test',
    now(),
    now()
  ),
  (
    '22222222-2222-2222-2222-222222222222',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'bob@example.test',
    now(),
    now()
  );

-- ╔══════════════════════════════════════════════════════════════════════╗
-- ║ 1. Les faits, imprimés — pas encore d'opinion.                        ║
-- ╚══════════════════════════════════════════════════════════════════════╝
select diag(
  'propriétaire de audit_logs        : '
  || (select pg_get_userbyid(relowner) from pg_class where oid = 'public.audit_logs'::regclass)
);

select diag(
  'rolbypassrls(ce propriétaire)     : '
  || (
    select coalesce(r.rolbypassrls::text, '?')
    from pg_class c
    join pg_roles r on r.oid = c.relowner
    where c.oid = 'public.audit_logs'::regclass
  )
  || '   <<< true => FORCE est neutralisé'
);

-- ATTENTION en lisant ce qui suit : en LOCAL, `postgres` est superutilisateur ;
-- en HÉBERGÉ, il ne l'est pas. Un superutilisateur contourne la RLS quoi qu'il
-- arrive — un test vert ici ne dit donc RIEN de l'hébergé tant que la ligne
-- `rolsuper` vaut true. Seul `rolbypassrls` se transpose.
select diag(
  'rolsuper(ce propriétaire)         : '
  || (
    select coalesce(r.rolsuper::text, '?')
    from pg_class c
    join pg_roles r on r.oid = c.relowner
    where c.oid = 'public.audit_logs'::regclass
  )
  || '   <<< true => le vert local ne prouve rien pour l''hébergé'
);

select diag(
  'ce propriétaire est-il membre de authenticated ? '
  || (
    select pg_has_role(c.relowner, 'authenticated', 'member')::text
    from pg_class c
    where c.oid = 'public.audit_logs'::regclass
  )
  || '   (si oui, sous FORCE il hérite des politiques `to authenticated`)'
);

select diag(
  'politiques d''écriture sur audit_logs : '
  || (
    select count(*)::text
    from pg_policies
    where schemaname = 'public'
      and tablename = 'audit_logs'
      and cmd in ('INSERT', 'ALL')
  )
);

-- ╔══════════════════════════════════════════════════════════════════════╗
-- ║ 2. L'état du schéma : la contradiction est-elle bien présente ?       ║
-- ╚══════════════════════════════════════════════════════════════════════╝
select ok(
  (select relforcerowsecurity from pg_class where oid = 'public.audit_logs'::regclass),
  '0002 pose bien FORCE ROW LEVEL SECURITY sur audit_logs'
);

select ok(
  (select prosecdef from pg_proc where oid = 'public.lh_audit(text,text,text,text)'::regprocedure),
  'lh_audit() est bien SECURITY DEFINER'
);

select is(
  (select proowner from pg_proc where oid = 'public.lh_audit(text,text,text,text)'::regprocedure),
  (select relowner from pg_class where oid = 'public.audit_logs'::regclass),
  'lh_audit() et audit_logs ont le MÊME propriétaire — la prémisse du raisonnement'
);

-- ╔══════════════════════════════════════════════════════════════════════╗
-- ║ 3. Le comportement : ce que voit un utilisateur authentifié.          ║
-- ╚══════════════════════════════════════════════════════════════════════╝

-- ── 3a. Appel direct de lh_audit() ────────────────────────────────────────
select set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}',
  true
);
set role authenticated;

select lives_ok(
  $$select lh_audit('test.ping', 'listing', '42', 'Ping de test.')$$,
  'lh_audit() ne lève pas d''erreur pour un utilisateur authentifié'
);

reset role;

select is(
  (select count(*)::int from audit_logs where action = 'test.ping'),
  1,
  'lh_audit() écrit RÉELLEMENT une ligne (et pas un silence)'
);

select is(
  (select user_id from audit_logs where action = 'test.ping'),
  '11111111-1111-1111-1111-111111111111'::uuid,
  '... attribuée à l''appelant, pas au propriétaire'
);

-- ── 3b. Le chemin qui compte vraiment : le trigger d'audit ────────────────
-- Si lh_log_search() est bloqué par la RLS, ce n'est pas l'audit qui casse,
-- c'est la CRÉATION DE RECHERCHE elle-même — la fonction principale de l'app.
set role authenticated;

select lives_ok(
  $$insert into saved_searches (user_id, name)
    values ('11111111-1111-1111-1111-111111111111', 'Maison Clermont')$$,
  'un authentifié peut créer une recherche (le trigger d''audit ne la bloque pas)'
);

select lives_ok(
  $$update saved_searches set active = false
    where user_id = '11111111-1111-1111-1111-111111111111'$$,
  '... et la désactiver (chemin UPDATE du trigger)'
);

reset role;

select is(
  (select count(*)::int from audit_logs where action = 'search.create'),
  1,
  'le trigger INSERT a écrit sa ligne d''audit'
);

select is(
  (select count(*)::int from audit_logs where action = 'search.toggle'),
  1,
  'le trigger UPDATE a écrit la sienne'
);

-- ── 3c. Les autres SECURITY DEFINER exposés au même risque ────────────────
set role authenticated;

select lives_ok(
  $$select lh_share_search(
      (select id from saved_searches where name = 'Maison Clermont'),
      'bob@example.test'
    )$$,
  'lh_share_search() ne lève pas d''erreur'
);

reset role;

select is(
  (select count(*)::int from search_shares where shared_with = '22222222-2222-2222-2222-222222222222'),
  1,
  'lh_share_search() crée RÉELLEMENT le partage (il lit saved_searches sous FORCE)'
);

set role authenticated;

select is(
  (
    select count(*)::int
    from lh_list_shares((select id from saved_searches where name = 'Maison Clermont'))
  ),
  1,
  'lh_list_shares() rend le partage (il joint auth.users sous FORCE)'
);

-- ── 3d. L'isolation, elle, doit tenir ─────────────────────────────────────
select set_config(
  'request.jwt.claims',
  '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}',
  true
);

select is(
  (select count(*)::int from audit_logs),
  0,
  'Bob ne voit AUCUNE ligne d''audit d''Alice'
);

select is(
  (select count(*)::int from saved_searches),
  1,
  'Bob voit la recherche partagée avec lui, et elle seule'
);

reset role;

select *
from finish();

rollback;
