-- ╔══════════════════════════════════════════════════════════════════════╗
-- ║ Miss LookHouse — le mécanisme, isolé de Supabase.                     ║
-- ║                                                                        ║
-- ║ Le test voisin observe ce que FONT nos migrations. Celui-ci établit    ║
-- ║ POURQUOI, sur une table jetable et des rôles créés pour l'occasion :   ║
-- ║                                                                        ║
-- ║   1. sous FORCE, une fonction SECURITY DEFINER dont le propriétaire    ║
-- ║      n'a ni BYPASSRLS ni SUPERUSER est soumise aux politiques — donc   ║
-- ║      BLOQUÉE sur une table sans politique d'écriture ;                 ║
-- ║   2. l'attribut BYPASSRLS l'emporte sur FORCE : le même appel passe.   ║
-- ║                                                                        ║
-- ║ Ces deux faits sont ceux de PostgreSQL, pas ceux de notre schéma. Ils  ║
-- ║ restent vrais si Supabase change la configuration de ses rôles — et    ║
-- ║ c'est justement pour ça qu'ils méritent d'être écrits : le jour où     ║
-- ║ `postgres` perdrait BYPASSRLS, la ligne 2 basculerait, et avec elle    ║
-- ║ tout schéma qui aurait parié dessus sans le savoir.                    ║
-- ╚══════════════════════════════════════════════════════════════════════╝

create extension if not exists pgtap with schema extensions;

set search_path to public, extensions;

begin;

select plan(6);

-- ── Un propriétaire ordinaire : ni superutilisateur, ni BYPASSRLS ─────────
create role lh_probe_owner nologin;
create role lh_probe_caller nologin;
grant lh_probe_owner to current_user;
grant lh_probe_caller to current_user;
grant create, usage on schema public to lh_probe_owner;
grant usage on schema public to lh_probe_caller;

select ok(
  not rolsuper and not rolbypassrls,
  'le propriétaire témoin n''a ni SUPERUSER ni BYPASSRLS'
)
from pg_roles
where rolname = 'lh_probe_owner';

set role lh_probe_owner;

create table lh_probe_audit (id bigint generated always as identity primary key, note text);

-- Exactement la situation de audit_logs : RLS forcée, AUCUNE politique.
alter table lh_probe_audit enable row level security;
alter table lh_probe_audit force row level security;

create function lh_probe_write(p_note text) returns void
language plpgsql security definer set search_path = public as $fn$
begin
  insert into lh_probe_audit (note) values (p_note);
end
$fn$;

grant execute on function lh_probe_write(text) to lh_probe_caller;

reset role;

-- ── 1. Sans BYPASSRLS : FORCE s'applique au DEFINER ───────────────────────
set role lh_probe_caller;

-- Les arguments sont castés explicitement : `throws_ok` est surchargé, et son
-- paramètre SQLSTATE est un `char(5)` — ni `text`, ni un littéral `unknown`,
-- qui laissent tous deux la résolution de surcharge sans réponse.
select throws_ok(
  $$select lh_probe_write('sous force')$$::text,
  '42501'::char(5),
  null::text,
  'FORCE soumet la fonction SECURITY DEFINER aux politiques : appel REFUSÉ'::text
);

reset role;

select is(
  (select count(*)::int from lh_probe_audit),
  0,
  '... et rien n''est écrit'
);

-- ── 2. BYPASSRLS l'emporte sur FORCE ──────────────────────────────────────
alter role lh_probe_owner bypassrls;

set role lh_probe_caller;

select lives_ok(
  $$select lh_probe_write('avec bypassrls')$$,
  'le propriétaire porte BYPASSRLS : le même appel passe'
);

reset role;

select is(
  (select count(*)::int from lh_probe_audit),
  1,
  '... et la ligne est écrite — BYPASSRLS l''emporte sur FORCE'
);

-- ── 3. Ce que FORCE protégeait vraiment : la connexion directe ────────────
-- Sans BYPASSRLS, le propriétaire lui-même était bloqué en écriture directe.
-- C'est le SEUL apport de FORCE — et ce chemin n'existe pas via PostgREST,
-- qui se connecte en `authenticator` puis bascule en anon/authenticated/
-- service_role, jamais sous le rôle propriétaire des tables.
alter role lh_probe_owner nobypassrls;

set role lh_probe_owner;

select throws_ok(
  $$insert into lh_probe_audit (note) values ('en direct')$$::text,
  '42501'::char(5),
  null::text,
  'FORCE bloque aussi le propriétaire en écriture DIRECTE — son seul apport réel'::text
);

reset role;

select *
from finish();

rollback;
