-- ╔══════════════════════════════════════════════════════════════════════╗
-- ║ Miss LookHouse — Schéma relationnel (PostgreSQL / Supabase)            ║
-- ║ Veille immobilière responsable. Modèle MONO-UTILISATEUR par ligne :    ║
-- ║ chaque donnée appartient à un `user_id` (auth.users). Toute la         ║
-- ║ sécurité est appliquée côté serveur par la RLS (0002). Le bundle       ║
-- ║ public (GitHub Pages) ne porte JAMAIS de règle d'accès — la clé anon   ║
-- ║ y est inoffensive.                                                     ║
-- ╚══════════════════════════════════════════════════════════════════════╝

create extension if not exists pgcrypto; -- gen_random_uuid()
create extension if not exists pg_trgm; -- similarité textuelle (GIN trigram)
create extension if not exists cube; -- requis par earthdistance
create extension if not exists earthdistance; -- rayon géographique (ll_to_earth)

-- ── Profils (1-1 avec auth.users) ────────────────────────────────────────
create table if not exists profiles (
  id              uuid primary key references auth.users (id) on delete cascade,
  email           text,
  display_name    text,
  locale          text not null default 'fr',
  -- RGPD : horodatage du consentement (collecte/traitement). Null = non donné.
  rgpd_consent_at timestamptz,
  created_at      timestamptz not null default now()
);

-- ── Sources (référentiel GLOBAL, géré par migration/admin, lecture seule) ─
-- `collection_mode` encode la STRATÉGIE DE COLLECTE RESPONSABLE par source.
create type collection_mode as enum (
  'manual_import',    -- coller une URL / un JSON (toujours dispo, zéro risque ToS)
  'browser_capture',  -- capture par l'utilisateur depuis sa propre session
  'authorized_api',   -- API officielle / flux autorisé (activé si disponible)
  'saved_search_url', -- on stocke l'URL de recherche, on n'aspire rien
  'server_fetch'      -- fetch serveur, DÉSACTIVÉ par défaut, gated par source
);

create table if not exists sources (
  id           text primary key,           -- slug : 'leboncoin', 'seloger', …
  label        text not null,
  homepage_url text,
  terms_url    text,                        -- lien CGU/ToS (transparence)
  -- Mode de collecte par DÉFAUT proposé pour cette source.
  default_mode collection_mode not null default 'manual_import',
  -- Le fetch serveur est-il autorisé/configuré pour cette source ? false = non.
  server_fetch_allowed boolean not null default false,
  notes        text,
  created_at   timestamptz not null default now()
);

-- ── Connecteurs par utilisateur (configuration NON secrète) ───────────────
-- Les SECRETS (identifiants d'API, jetons) ne sont JAMAIS stockés ici : on ne
-- garde que le NOM d'un secret d'Edge Function (`secret_ref`). Les valeurs
-- vivent dans `supabase secrets set …` côté serveur.
create table if not exists source_connectors (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  source_id  text not null references sources (id) on delete cascade,
  label      text not null,
  enabled    boolean not null default true,
  mode       collection_mode not null default 'manual_import',
  config     jsonb not null default '{}'::jsonb, -- params non secrets (URL, débit…)
  secret_ref text,                                -- nom d'un secret serveur, pas sa valeur
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists source_connectors_user_idx on source_connectors (user_id);

-- ── Recherches surveillées ────────────────────────────────────────────────
create type watch_frequency as enum ('hourly', 'daily', 'manual');

create table if not exists saved_searches (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users (id) on delete cascade,
  name              text not null,
  source_ids        text[] not null default '{}',  -- vide = toutes les sources actives
  -- Zone géographique
  city              text,
  postal_code       text,
  center_lat        double precision,
  center_lng        double precision,
  radius_km         double precision,
  polygon           jsonb,                          -- GeoJSON Polygon optionnel
  -- Critères
  price_min         numeric(12, 2),
  price_max         numeric(12, 2),
  surface_min       numeric(8, 2),
  surface_max       numeric(8, 2),
  rooms_min         integer,
  rooms_max         integer,
  property_types    text[] not null default '{}',
  keywords_required text[] not null default '{}',
  keywords_excluded text[] not null default '{}',
  frequency         watch_frequency not null default 'hourly',
  active            boolean not null default true,
  last_run_at       timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists saved_searches_user_idx on saved_searches (user_id);
create index if not exists saved_searches_due_idx
  on saved_searches (frequency, active, last_run_at);

-- ── Clusters d'annonces (regroupement de doublons probables) ──────────────
create type cluster_kind as enum (
  'doublon_exact', 'probable_identique', 'similaire'
);

create table if not exists listing_clusters (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users (id) on delete cascade,
  label           text,
  kind            cluster_kind not null default 'similaire',
  head_listing_id uuid,                              -- FK ajoutée après `listings`
  size            integer not null default 1,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists listing_clusters_user_idx on listing_clusters (user_id);

-- ── Annonces (état COURANT canonique) ─────────────────────────────────────
create type listing_status_src as enum ('active', 'removed', 'unknown');

create table if not exists listings (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users (id) on delete cascade,
  source_id        text not null references sources (id),
  external_id      text not null,                    -- identifiant chez la source
  url              text,
  title            text,
  description      text,
  price            numeric(12, 2),
  currency         text not null default 'EUR',
  surface_m2       numeric(8, 2),
  rooms            integer,
  bedrooms         integer,
  property_type    text,
  floor            text,
  dpe              text,                              -- A..G si disponible
  charges          numeric(10, 2),
  agency_fees      numeric(10, 2),
  lat              double precision,
  lng              double precision,
  postal_code      text,
  city             text,
  address_approx   text,
  is_pro           boolean,                           -- true = agence, false = particulier
  contact_name     text,
  published_at     timestamptz,
  source_updated_at timestamptz,
  source_status    listing_status_src not null default 'active',
  -- Empreinte de contenu (hash normalisé) pour détecter les changements.
  fingerprint      text,
  -- Traçabilité temporelle
  first_seen_at    timestamptz not null default now(),
  last_seen_at     timestamptz not null default now(),
  last_changed_at  timestamptz not null default now(),
  -- Périodes de disparition/réapparition (suivi du recyclage)
  disappeared_at   timestamptz,
  reappeared_count integer not null default 0,
  -- Rattachements
  search_id        uuid references saved_searches (id) on delete set null,
  cluster_id       uuid references listing_clusters (id) on delete set null,
  -- Scores (recalculés par le pipeline ; 0..100). Explicables, pas une boîte noire.
  relevance_score  integer,
  freshness_score  integer,
  raw              jsonb,                             -- dernier payload normalisé
  created_at       timestamptz not null default now(),
  unique (user_id, source_id, external_id)
);
create index if not exists listings_user_idx on listings (user_id);
create index if not exists listings_search_idx on listings (search_id);
create index if not exists listings_cluster_idx on listings (cluster_id);
create index if not exists listings_source_ext_idx on listings (source_id, external_id);
create index if not exists listings_price_idx on listings (user_id, price);
create index if not exists listings_geo_idx
  on listings using gist (ll_to_earth(lat, lng))
  where lat is not null and lng is not null;
create index if not exists listings_title_trgm_idx
  on listings using gin (title gin_trgm_ops);
create index if not exists listings_desc_trgm_idx
  on listings using gin (description gin_trgm_ops);

-- FK différée de la tête de cluster vers une annonce.
alter table listing_clusters
  drop constraint if exists listing_clusters_head_fk;
alter table listing_clusters
  add constraint listing_clusters_head_fk
  foreign key (head_listing_id) references listings (id) on delete set null;

-- ── Versions d'annonce (HISTORIQUE append-only + deltas) ───────────────────
create table if not exists listing_versions (
  id           bigint generated by default as identity primary key,
  user_id      uuid not null references auth.users (id) on delete cascade,
  listing_id   uuid not null references listings (id) on delete cascade,
  captured_at  timestamptz not null default now(),
  price        numeric(12, 2),
  surface_m2   numeric(8, 2),
  rooms        integer,
  bedrooms     integer,
  title        text,
  description  text,
  source_status listing_status_src,
  media_count  integer,
  content_hash text,
  delta        jsonb,                                 -- diff calculé vs version précédente
  raw          jsonb
);
create index if not exists listing_versions_listing_idx
  on listing_versions (listing_id, captured_at desc);
create index if not exists listing_versions_user_idx on listing_versions (user_id);

-- ── Historique de prix (dénormalisé pour des graphes bon marché) ──────────
create table if not exists listing_price_history (
  id          bigint generated by default as identity primary key,
  user_id     uuid not null references auth.users (id) on delete cascade,
  listing_id  uuid not null references listings (id) on delete cascade,
  observed_at timestamptz not null default now(),
  price       numeric(12, 2) not null
);
create index if not exists listing_price_history_idx
  on listing_price_history (listing_id, observed_at);

-- ── Médias (métadonnées ; binaire éventuel dans Storage privé) ────────────
create type media_kind as enum ('photo', 'thumbnail', 'floorplan');

create table if not exists listing_media (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  listing_id   uuid not null references listings (id) on delete cascade,
  kind         media_kind not null default 'photo',
  url          text,
  storage_path text,                                  -- bucket privé `listing-media`
  phash        text,                                  -- hash perceptuel (dHash hex) pour similarité image
  position     integer not null default 0,
  captured_at  timestamptz not null default now()
);
create index if not exists listing_media_listing_idx on listing_media (listing_id);
create index if not exists listing_media_phash_idx on listing_media (user_id, phash);

-- ── Similarité (arêtes PAIRÉES, score 0..100, explicable) ─────────────────
create type similarity_bucket as enum (
  'doublon_exact', 'probable_identique', 'similaire', 'different'
);

create table if not exists listing_similarity (
  id          bigint generated by default as identity primary key,
  user_id     uuid not null references auth.users (id) on delete cascade,
  listing_a   uuid not null references listings (id) on delete cascade,
  listing_b   uuid not null references listings (id) on delete cascade,
  score       integer not null check (score between 0 and 100),
  bucket      similarity_bucket not null,
  breakdown   jsonb not null default '[]'::jsonb,     -- facteurs explicables
  computed_at timestamptz not null default now(),
  -- On ne garde qu'une arête par paire (a < b imposé par convention applicative).
  unique (listing_a, listing_b),
  check (listing_a <> listing_b)
);
create index if not exists listing_similarity_a_idx on listing_similarity (listing_a);
create index if not exists listing_similarity_b_idx on listing_similarity (listing_b);

-- ── Qualification utilisateur (statut COURANT) ────────────────────────────
create type user_listing_status as enum (
  'a_revoir', 'interessante', 'ignoree', 'doublon',
  'suspecte', 'verifiee', 'visitee', 'offre_faite', 'rejetee'
);

create table if not exists listing_status (
  listing_id uuid primary key references listings (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  status     user_listing_status not null default 'a_revoir',
  tags       text[] not null default '{}',
  updated_at timestamptz not null default now()
);
create index if not exists listing_status_user_idx on listing_status (user_id, status);

-- ── Notes privées ─────────────────────────────────────────────────────────
create table if not exists listing_notes (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  listing_id uuid not null references listings (id) on delete cascade,
  body       text not null,
  created_at timestamptz not null default now()
);
create index if not exists listing_notes_listing_idx on listing_notes (listing_id);

-- ── Vérifications métier (historisées) ────────────────────────────────────
create table if not exists listing_verifications (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  listing_id    uuid not null references listings (id) on delete cascade,
  verified      boolean not null default false,
  confidence    integer check (confidence between 0 and 100),
  checklist     jsonb not null default '{}'::jsonb,
  anomalies     text[] not null default '{}',
  flagged_reason text,                                -- trompeuse/recyclée/incohérente/incomplète
  created_at    timestamptz not null default now()
);
create index if not exists listing_verifications_listing_idx
  on listing_verifications (listing_id, created_at desc);

-- ── Notifications ─────────────────────────────────────────────────────────
create type notification_type as enum (
  'new_listing', 'price_drop', 'recycled', 'important_change',
  'probable_duplicate', 'suspicious', 'digest'
);

create table if not exists notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  type       notification_type not null,
  title      text not null,
  body       text,
  listing_id uuid references listings (id) on delete cascade,
  search_id  uuid references saved_searches (id) on delete set null,
  payload    jsonb not null default '{}'::jsonb,
  read_at    timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists notifications_user_idx
  on notifications (user_id, created_at desc);
create index if not exists notifications_unread_idx
  on notifications (user_id) where read_at is null;

-- ── Préférences de notification ───────────────────────────────────────────
create type digest_cadence as enum ('off', 'daily', 'weekly');

create table if not exists notification_preferences (
  user_id        uuid primary key references auth.users (id) on delete cascade,
  email_enabled  boolean not null default false,
  webpush_enabled boolean not null default false,
  webhook_url    text,                                -- Telegram/Slack/Discord webhook (optionnel)
  email_digest   digest_cadence not null default 'off',
  -- Seuils : { price_drop_pct: 3, min_relevance: 50 }
  thresholds     jsonb not null default '{"price_drop_pct":3,"min_relevance":50}'::jsonb,
  quiet_hours    jsonb,                               -- { start: 22, end: 7 }
  updated_at     timestamptz not null default now()
);

-- ── Abonnements Web Push (PWA) ────────────────────────────────────────────
create table if not exists push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  endpoint   text not null unique,
  p256dh     text not null,
  auth       text not null,
  user_agent text,
  created_at timestamptz not null default now()
);
create index if not exists push_subscriptions_user_idx on push_subscriptions (user_id);

-- ── Pipeline d'ingestion : exécutions + événements (journal, rejouable) ───
create type run_trigger as enum ('schedule', 'manual', 'replay');
create type run_status as enum ('queued', 'running', 'success', 'partial', 'error');

create table if not exists ingestion_runs (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  search_id   uuid references saved_searches (id) on delete set null,
  source_id   text references sources (id) on delete set null,
  trigger     run_trigger not null default 'schedule',
  status      run_status not null default 'queued',
  started_at  timestamptz,
  finished_at timestamptz,
  -- { fetched, new, updated, removed, reappeared, errors }
  stats       jsonb not null default '{}'::jsonb,
  error       text,
  created_at  timestamptz not null default now()
);
create index if not exists ingestion_runs_user_idx
  on ingestion_runs (user_id, created_at desc);
create index if not exists ingestion_runs_search_idx on ingestion_runs (search_id);

create type event_level as enum ('info', 'warn', 'error');

create table if not exists ingestion_events (
  id      bigint generated by default as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  run_id  uuid not null references ingestion_runs (id) on delete cascade,
  level   event_level not null default 'info',
  step    text not null,
  message text not null,
  payload jsonb,
  at      timestamptz not null default now()
);
create index if not exists ingestion_events_run_idx on ingestion_events (run_id, at);

-- ── Audit de sécurité (append-only, alimenté côté serveur) ────────────────
create table if not exists audit_logs (
  id          bigint generated by default as identity primary key,
  user_id     uuid references auth.users (id) on delete set null,
  action      text not null,                          -- search.create, listing.status, export…
  target_type text,
  target_id   text,
  summary     text not null,
  ip          inet,
  user_agent  text,
  at          timestamptz not null default now()
);
create index if not exists audit_logs_user_idx on audit_logs (user_id, at desc);

-- ── Déclencheurs techniques (horodatage + historique de prix) ─────────────
create or replace function lh_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger saved_searches_touch
  before update on saved_searches
  for each row execute function lh_touch_updated_at();
create trigger source_connectors_touch
  before update on source_connectors
  for each row execute function lh_touch_updated_at();
create trigger listing_status_touch
  before update on listing_status
  for each row execute function lh_touch_updated_at();

-- À chaque insertion de version, alimente l'historique de prix si le prix change.
create or replace function lh_record_price_point()
returns trigger language plpgsql as $$
declare last_price numeric(12,2);
begin
  if new.price is null then return new; end if;
  select price into last_price
    from listing_price_history
    where listing_id = new.listing_id
    order by observed_at desc limit 1;
  if last_price is null or last_price <> new.price then
    insert into listing_price_history (user_id, listing_id, observed_at, price)
      values (new.user_id, new.listing_id, new.captured_at, new.price);
  end if;
  return new;
end $$;

create trigger listing_versions_price
  after insert on listing_versions
  for each row execute function lh_record_price_point();
