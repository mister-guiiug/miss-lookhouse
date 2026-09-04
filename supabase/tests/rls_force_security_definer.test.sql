-- ╔══════════════════════════════════════════════════════════════════════╗
-- ║ Miss LookHouse — FORCE ROW LEVEL SECURITY × SECURITY DEFINER.         ║
-- ║                                                                        ║
-- ║ D'OÙ VIENT CE TEST. 0002 posait `force row level security` sur les     ║
-- ║ tables ET écrivait dans `audit_logs` depuis des fonctions              ║
-- ║ `security definer` — deux choix contradictoires : `force` soumet le    ║
-- ║ PROPRIÉTAIRE aux politiques, et une fonction `security definer`        ║
-- ║ s'exécute justement sous ce propriétaire. Or `audit_logs` n'a AUCUNE   ║
-- ║ politique d'écriture. Seul l'attribut BYPASSRLS du propriétaire        ║
-- ║ sauvait la mise. 0012 a retiré `force` ; ce test veille.               ║
-- ║                                                                        ║
-- ║ CE QU'IL GARDE. La section 2 épingle les DEUX faits dont dépend le     ║
-- ║ reste : `enable` partout, `force` nulle part, et BYPASSRLS toujours    ║
-- ║ porté par le propriétaire. La section 3 rejoue les quatre chemins      ║
-- ║ `security definer` du dépôt en rôle `authenticated`.                   ║
-- ║                                                                        ║
-- ║ Le mode d'échec redouté n'est pas l'erreur : c'est le silence. Une     ║
-- ║ lecture bloquée par la RLS ne lève rien, elle rend zéro ligne. On      ║
-- ║ compte donc les lignes, on ne se contente jamais de « ça n'a pas       ║
-- ║ planté ».                                                              ║
-- ╚══════════════════════════════════════════════════════════════════════╝

create extension if not exists pgtap with schema extensions;

set search_path to public, extensions;

begin;

select plan(17);

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
  || '   <<< true => c''est lui qui neutralisait FORCE'
);

-- Mesuré à false le 2026-09-04, et c'est ce qui rend le reste transposable :
-- un superutilisateur contournerait la RLS quoi qu'il arrive, et le vert local
-- ne dirait alors rien de l'hébergé. Ici le rôle local n'en est pas un — c'est
-- donc bien BYPASSRLS qui opère, des deux côtés.
select diag(
  'rolsuper(ce propriétaire)         : '
  || (
    select coalesce(r.rolsuper::text, '?')
    from pg_class c
    join pg_roles r on r.oid = c.relowner
    where c.oid = 'public.audit_logs'::regclass
  )
  || '   <<< true annulerait la portée du test'
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
-- ║ 2. L'état du schéma, une fois 0012 passée.                            ║
-- ╚══════════════════════════════════════════════════════════════════════╝
select is(
  (
    select count(*)::int
    from pg_class c
    join pg_namespace ns on ns.oid = c.relnamespace
    where ns.nspname = 'public' and c.relkind = 'r' and c.relforcerowsecurity
  ),
  0,
  '0012 a retiré FORCE de toutes les tables de public'
);

select is(
  (
    select count(*)::int
    from pg_class c
    join pg_namespace ns on ns.oid = c.relnamespace
    where ns.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity
  ),
  0,
  '... sans jamais retirer `enable` : aucune table de public n''est ouverte'
);

-- Le fait mesuré qui rendait `force` inerte. On l'épingle : s'il bascule un
-- jour, c'est ici qu'on l'apprendra — et non par une création de recherche
-- qui échoue en production.
select ok(
  (
    select r.rolbypassrls
    from pg_class c
    join pg_roles r on r.oid = c.relowner
    where c.oid = 'public.audit_logs'::regclass
  ),
  'le propriétaire des tables porte BYPASSRLS (ce qui neutralisait FORCE)'
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
