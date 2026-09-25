-- ╔══════════════════════════════════════════════════════════════════════╗
-- ║ Miss LookHouse — la vue des recherches dues n'est plus publique (0019).║
-- ║                                                                        ║
-- ║ `lh_due_searches` tournait sous `postgres` (BYPASSRLS) et restait     ║
-- ║ lisible par `anon` : la clé publique de la PWA suffisait à lire le nom ║
-- ║ et le propriétaire des recherches de tous les comptes. Ce fichier      ║
-- ║ garde les deux barrières, et vérifie que l'ingestion lit toujours.     ║
-- ╚══════════════════════════════════════════════════════════════════════╝

create extension if not exists pgtap with schema extensions;

set search_path to public, extensions;

begin;

select plan(6);

-- Rend le SQLSTATE d'une instruction, ou « aucune erreur ». SECURITY INVOKER.
create function lh_t_due(p_sql text) returns text language plpgsql as $fn$
begin
  execute p_sql;
  return 'aucune erreur';
exception
  when others then return sqlstate;
end
$fn$;

grant execute on function lh_t_due(text) to anon, authenticated, service_role;

select ok(
  (select coalesce('security_invoker=true' = any(reloptions), false)
     from pg_class where oid = 'public.lh_due_searches'::regclass),
  'la vue s''exécute avec les droits de son lecteur (security_invoker)'
);

select ok(
  not has_table_privilege('anon', 'public.lh_due_searches', 'select'),
  'anon ne lit plus la vue'
);

select ok(
  not has_table_privilege('authenticated', 'public.lh_due_searches', 'select'),
  'un compte connecté non plus'
);

select ok(
  has_table_privilege('service_role', 'public.lh_due_searches', 'select'),
  'service_role, celui d''ingest-run, la lit toujours'
);

-- La lecture réelle, comme la ferait PostgREST avec la clé anon.
set role anon;
select set_config('lh.anon', lh_t_due('select count(*) from public.lh_due_searches'), true);
reset role;
select is(current_setting('lh.anon'), '42501', 'la lecture en rôle anon est refusée');

set role service_role;
select set_config('lh.service', lh_t_due('select count(*) from public.lh_due_searches'), true);
reset role;
select is(current_setting('lh.service'), 'aucune erreur', 'la lecture en rôle service_role passe');

select * from finish();

rollback;
