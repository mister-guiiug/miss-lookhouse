-- Miss LookHouse — 0011 — la table du keep-alive anti-pause.
--
-- POURQUOI ELLE EXISTE. Un projet Supabase Free se met en pause après sept
-- jours SANS REQUÊTE. Une app peu utilisée s'éteint donc toute seule, et son
-- déploiement échoue ensuite sur « project is paused » — c'est arrivé à
-- miss-carbook le 29/08/2026, et personne n'a été prévenu.
--
-- Le workflow `supabase-keepalive.yml` fait un SELECT anonyme sur cette table
-- tous les trois jours. Une vraie requête suffit à remettre le compteur à
-- zéro ; la table peut rester vide.
--
-- AUCUNE DONNÉE SENSIBLE : une identité et un horodatage. La policy ouvre la
-- LECTURE SEULE au rôle anonyme — c'est tout ce dont le ping a besoin, et
-- l'anon key est de toute façon publiée dans le bundle de l'app.
-- Idempotent : rejouable sans effet de bord.

create table if not exists public.keep_alive (
  id bigint generated always as identity primary key,
  pinged_at timestamptz not null default now()
);

alter table public.keep_alive enable row level security;

drop policy if exists "anon read keep_alive" on public.keep_alive;

create policy "anon read keep_alive" on public.keep_alive for select to anon
using (true);

-- Une ligne de départ : le SELECT compterait comme activité même à vide, mais
-- une table peuplée rend le ping lisible depuis le dashboard.
insert into public.keep_alive (pinged_at)
select now()
where not exists (select 1 from public.keep_alive);
