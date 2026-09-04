-- ╔══════════════════════════════════════════════════════════════════════╗
-- ║ Miss LookHouse — le mécanisme, isolé de Supabase.                     ║
-- ║                                                                        ║
-- ║ Le test voisin observe ce que FONT nos migrations. Celui-ci établit    ║
-- ║ POURQUOI, sur des tables jetables et des rôles créés pour l'occasion.  ║
-- ║                                                                        ║
-- ║ Deux tables STRICTEMENT identiques — RLS forcée, aucune politique —    ║
-- ║ chacune écrite par une fonction SECURITY DEFINER. Une seule différence ║
-- ║ entre elles : leur PROPRIÉTAIRE.                                       ║
-- ║                                                                        ║
-- ║   • propriétaire sans BYPASSRLS → l'appel est REFUSÉ (42501) ;         ║
-- ║   • propriétaire avec BYPASSRLS → le même appel PASSE.                 ║
-- ║                                                                        ║
-- ║ Ce sont les faits de PostgreSQL, pas ceux de notre schéma : ils        ║
-- ║ resteront vrais si Supabase change la configuration de ses rôles. Et   ║
-- ║ c'est pour ça qu'ils méritent d'être écrits — le jour où `postgres`    ║
-- ║ perdrait BYPASSRLS, le second cas basculerait, et avec lui tout schéma ║
-- ║ qui aurait parié dessus sans le savoir. 0012 a fait en sorte que le    ║
-- ║ nôtre n'en fasse plus partie.                                          ║
-- ║                                                                        ║
-- ║ NB : le test ne DONNE jamais BYPASSRLS à personne — l'attribut exige   ║
-- ║ le superutilisateur, que `postgres` n'est pas sur Supabase. Il se sert ║
-- ║ des rôles tels qu'ils sont, ce qui vaut mieux : il mesure le réel.     ║
-- ╚══════════════════════════════════════════════════════════════════════╝

create extension if not exists pgtap with schema extensions;

set search_path to public, extensions;

begin;

select plan(6);

-- ── Attraper le SQLSTATE plutôt que de plaider auprès de throws_ok() ──────
-- `throws_ok` est surchargé (text, char(5), int4…) et aucune combinaison de
-- casts ne l'a résolu ici. On rend le code d'erreur, on le compare : même
-- verdict, zéro résolution de surcharge. SECURITY INVOKER — donc exécutée
-- sous le rôle courant, ce qui est tout l'intérêt.
create function lh_probe_try(p_sql text) returns text language plpgsql as $fn$
begin
  execute p_sql;
  return 'aucune erreur';
exception
  when others then return sqlstate;
end
$fn$;

create role lh_probe_owner nologin;
create role lh_probe_caller nologin;
grant lh_probe_owner to current_user;
grant lh_probe_caller to current_user;
grant create, usage on schema public to lh_probe_owner;
grant usage on schema public to lh_probe_caller;

-- Les assertions qui suivent s'exécutent SOUS ces rôles. Sans USAGE sur le
-- schéma de pgTAP, ses fonctions leur sont invisibles — et PostgreSQL le dit
-- comme si elles n'existaient pas (« function is(...) does not exist »), ce
-- qui envoie chercher un problème de surcharge là où il n'y a qu'un droit
-- manquant. Le schéma est résolu, pas supposé : `anon` et `authenticated` ont
-- ce droit d'origine, un rôle créé à la main ne l'a pas.
do $$
declare
  s text;
begin
  select n.nspname into s
  from pg_extension e
  join pg_namespace n on n.oid = e.extnamespace
  where e.extname = 'pgtap';

  execute format('grant usage on schema %I to lh_probe_owner, lh_probe_caller', s);
end $$;

select ok(
  not rolsuper and not rolbypassrls,
  'le propriétaire témoin n''a ni SUPERUSER ni BYPASSRLS'
)
from pg_roles
where rolname = 'lh_probe_owner';

-- ── Cas A : propriétaire ORDINAIRE ────────────────────────────────────────
set role lh_probe_owner;

create table lh_probe_a (id bigint generated always as identity primary key, note text);
alter table lh_probe_a enable row level security;
alter table lh_probe_a force row level security;

create function lh_probe_write_a(p_note text) returns void
language plpgsql security definer set search_path = public as $fn$
begin
  insert into lh_probe_a (note) values (p_note);
end
$fn$;

grant execute on function lh_probe_write_a(text) to lh_probe_caller;

reset role;

-- ── Cas B : propriétaire PORTEUR de BYPASSRLS (celui de nos vraies tables)
create table lh_probe_b (id bigint generated always as identity primary key, note text);
alter table lh_probe_b enable row level security;
alter table lh_probe_b force row level security;

create function lh_probe_write_b(p_note text) returns void
language plpgsql security definer set search_path = public as $fn$
begin
  insert into lh_probe_b (note) values (p_note);
end
$fn$;

grant execute on function lh_probe_write_b(text) to lh_probe_caller;

-- ── 1. Sans BYPASSRLS : FORCE s'applique au DEFINER ───────────────────────
set role lh_probe_caller;

select is(
  lh_probe_try($$select lh_probe_write_a('sous force')$$),
  '42501'::text,
  'FORCE soumet la fonction SECURITY DEFINER aux politiques : appel REFUSÉ'::text
);

reset role;

select is(
  (select count(*)::int from lh_probe_a),
  0::int,
  '... et rien n''est écrit'::text
);

-- ── 2. BYPASSRLS l'emporte sur FORCE ──────────────────────────────────────
set role lh_probe_caller;

select is(
  lh_probe_try($$select lh_probe_write_b('avec bypassrls')$$),
  'aucune erreur'::text,
  'même table, même fonction, propriétaire porteur de BYPASSRLS : ça passe'::text
);

reset role;

select is(
  (select count(*)::int from lh_probe_b),
  1::int,
  '... et la ligne est écrite — BYPASSRLS l''emporte sur FORCE'::text
);

-- ── 3. Ce que FORCE protégeait vraiment : la connexion directe ────────────
-- Sans BYPASSRLS, le propriétaire lui-même est bloqué en écriture directe.
-- C'est le SEUL apport de FORCE — et ce chemin n'existe pas via PostgREST,
-- qui se connecte en `authenticator` puis bascule en anon/authenticated/
-- service_role, jamais sous le rôle propriétaire des tables.
set role lh_probe_owner;

select is(
  lh_probe_try($$insert into lh_probe_a (note) values ('en direct')$$),
  '42501'::text,
  'FORCE bloque aussi le propriétaire en écriture DIRECTE — son seul apport réel'::text
);

reset role;

select *
from finish();

rollback;
