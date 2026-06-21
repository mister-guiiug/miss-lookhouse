-- ╔══════════════════════════════════════════════════════════════════════╗
-- ║ Miss LookHouse — Planification de l'ingestion (toutes les heures).     ║
-- ║                                                                        ║
-- ║ Stratégie : `pg_cron` déclenche `pg_net` qui POST sur l'Edge Function  ║
-- ║ `ingest-run`. Celle-ci (clé service_role, côté serveur) parcourt les   ║
-- ║ recherches DUES de tous les utilisateurs et exécute le pipeline.       ║
-- ║                                                                        ║
-- ║ Le secret (URL de la fonction + clé service_role) est lu dans          ║
-- ║ `vault.secrets`, JAMAIS écrit en clair dans une migration versionnée.  ║
-- ╚══════════════════════════════════════════════════════════════════════╝

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Vue d'aide : quelles recherches sont « dues » maintenant ?
-- hourly : jamais lancée ou lancée il y a > 55 min ; daily : > ~23 h.
create or replace view lh_due_searches as
  select id, user_id, name, frequency, last_run_at
  from saved_searches
  where active
    and (
      (frequency = 'hourly'
        and (last_run_at is null or last_run_at < now() - interval '55 minutes'))
      or (frequency = 'daily'
        and (last_run_at is null or last_run_at < now() - interval '23 hours'))
    );

-- Fonction d'amorçage : POST vers l'Edge Function `ingest-run`.
-- Les secrets `lh_ingest_url` et `lh_ingest_token` doivent être présents dans
-- vault.secrets (cf. README). Sans eux, la fonction ne fait rien (no-op sûr).
create or replace function lh_trigger_ingestion()
returns void language plpgsql security definer set search_path = public, vault, net as $$
declare
  fn_url text;
  fn_token text;
begin
  select decrypted_secret into fn_url from vault.decrypted_secrets where name = 'lh_ingest_url';
  select decrypted_secret into fn_token from vault.decrypted_secrets where name = 'lh_ingest_token';
  if fn_url is null or fn_token is null then
    raise notice 'lh_trigger_ingestion: secrets manquants (lh_ingest_url / lh_ingest_token) — no-op.';
    return;
  end if;
  perform net.http_post(
    url := fn_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || fn_token
    ),
    body := jsonb_build_object('trigger', 'schedule')
  );
end $$;

-- Programmation horaire. Idempotent : on déprogramme avant de reprogrammer.
do $$
begin
  perform cron.unschedule('lh-hourly-ingestion')
    where exists (select 1 from cron.job where jobname = 'lh-hourly-ingestion');
exception when others then
  raise notice 'cron.unschedule ignorée : %', sqlerrm;
end $$;

-- NB : à exécuter une fois les secrets en place. Laissé actif ici ; si les
-- secrets manquent, lh_trigger_ingestion() est un no-op inoffensif.
select cron.schedule(
  'lh-hourly-ingestion',
  '0 * * * *',            -- toutes les heures, à la minute 0
  $$ select lh_trigger_ingestion(); $$
);
