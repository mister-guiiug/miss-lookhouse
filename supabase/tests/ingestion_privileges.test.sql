-- ╔══════════════════════════════════════════════════════════════════════╗
-- ║ Miss LookHouse — seul pg_cron déclenche l'ingestion (0015).            ║
-- ║                                                                        ║
-- ║ `lh_trigger_ingestion()` est `security definer` et lit le jeton de     ║
-- ║ l'Edge Function `ingest-run` dans le coffre. Jusqu'à 0015, `anon`      ║
-- ║ pouvait l'appeler par PostgREST, donc lancer des ingestions à volonté  ║
-- ║ avec la seule clé publique de la PWA. Ce fichier garde la porte        ║
-- ║ fermée, et vérifie que le cron, lui, a toujours la clé.                ║
-- ╚══════════════════════════════════════════════════════════════════════╝

create extension if not exists pgtap with schema extensions;

set search_path to public, extensions;

begin;

select plan(6);

-- Rend le SQLSTATE d'une instruction, ou « aucune erreur ». SECURITY INVOKER :
-- elle s'exécute sous le rôle courant.
create function lh_t_try(p_sql text) returns text language plpgsql as $fn$
begin
  execute p_sql;
  return 'aucune erreur';
exception
  when others then return sqlstate;
end
$fn$;

grant execute on function lh_t_try(text) to anon;

select ok(
  not has_function_privilege('anon', 'public.lh_trigger_ingestion()', 'execute'),
  'anon ne peut plus déclencher l''ingestion'
);

select ok(
  not has_function_privilege('authenticated', 'public.lh_trigger_ingestion()', 'execute'),
  'un utilisateur connecté non plus'
);

select ok(
  has_function_privilege('service_role', 'public.lh_trigger_ingestion()', 'execute'),
  'service_role garde la voie d''administration'
);

select ok(
  has_function_privilege('postgres', 'public.lh_trigger_ingestion()', 'execute'),
  'postgres, sous qui tourne le cron, garde son droit'
);

select is(
  (select count(*)::int from cron.job
    where jobname = 'lh-hourly-ingestion'
      and command like '%lh_trigger_ingestion%'),
  1,
  'le cron horaire appelle toujours la fonction'
);

-- L'appel réel, sous `anon`, comme le ferait PostgREST.
set role anon;
select set_config('lh.res', lh_t_try('select public.lh_trigger_ingestion()'), true);
reset role;

select is(
  current_setting('lh.res'),
  '42501',
  'l''appel en rôle anon est refusé (permission denied)'
);

select * from finish();

rollback;
