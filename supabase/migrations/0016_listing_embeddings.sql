-- ╔══════════════════════════════════════════════════════════════════════╗
-- ║ Miss LookHouse — 0016 — similarité par EMBEDDINGS (pgvector), option. ║
-- ╚══════════════════════════════════════════════════════════════════════╝
--
-- CE QUE ÇA AJOUTE. Un vecteur de 384 dimensions par annonce, calculé par
-- `gte-small` (le modèle intégré au runtime Edge de Supabase : aucune clé,
-- aucun secret) dans la fonction Edge `embed`, que `ingest-run` appelle en fin
-- de passage. Le front s'en sert EN OPTION, après l'heuristique : le cosinus
-- devient un facteur de plus du score explicable (src/domain/embedding.ts).
--
-- CE QUE `gte-small` VAUT ICI, HONNÊTEMENT. Il est entraîné surtout sur
-- l'anglais. Pour repérer un doublon ou une republication — deux textes qui
-- se recouvrent presque mot pour mot —, il suffit. Pour une similarité de SENS
-- fine entre deux annonces françaises reformulées, il ne suffit pas. Et il ne
-- lit que les 512 premiers jetons : d'où la troncature de la source à 4 000
-- caractères, qui borne le travail sans rien perdre de ce qu'il aurait lu.
--
-- LA VISIBILITÉ EST CELLE DES ANNONCES, EXACTEMENT. Une annonce se lit par
-- trois politiques additionnelles (OU) : la sienne (0002, `user_id =
-- auth.uid()`), celle d'une recherche partagée avec soi (0006), celle d'une
-- recherche publique (0010). Plutôt que de recopier ces trois conditions — une
-- copie vieillit au rythme de l'original, c'est ainsi que `search_shares`
-- avait échappé à la liste de 0002 —, la politique DÉLÈGUE : un embedding est
-- lisible si et seulement si son annonce l'est. La sous-requête sur `listings`
-- s'exécute sous l'appelant, donc sous la RLS de `listings` : toute politique
-- future des annonces vaudra pour leurs embeddings, sans migration.
--
-- PERSONNE N'ÉCRIT CÔTÉ CLIENT. Seule `embed` écrit, en `service_role` (hors
-- RLS). `authenticated` n'a que SELECT — le privilège, seconde barrière
-- indépendante de la politique, comme 0014 l'a posé pour `keep_alive`.
--
-- RIEN N'EST PERDU EN CAS DE SUPPRESSION : `on delete cascade` depuis
-- `listings`. `delete_my_account()` (0013) efface les annonces de l'appelant,
-- la cascade emporte leurs embeddings — la table n'a pas de `user_id` à balayer.
--
-- PRÉREQUIS. `vector` s'installe dans le schéma `extensions`, comme le
-- recommande Supabase. Si l'extension avait été activée ailleurs (`public`)
-- sur le projet, la migration échoue proprement sur `extensions.vector` et
-- rien n'est appliqué : `alter extension vector set schema extensions`, puis
-- relancer.
--
-- Additive et rejouable : `if not exists`, `create or replace`, politique
-- supprimée puis recréée.

create extension if not exists vector with schema extensions;

-- ── La table ──────────────────────────────────────────────────────────────
create table if not exists public.listing_embeddings (
  listing_id  uuid primary key references public.listings (id) on delete cascade,
  embedding   extensions.vector(384) not null,
  -- Le modèle qui a produit le vecteur : un changement de modèle rend tous
  -- les vecteurs incomparables, et `lh_embedding_backlog` les recalcule.
  model       text not null,
  -- Empreinte (md5) du TEXTE SOURCE embeddé : on ne recalcule que ce qui a
  -- changé. Détecteur de changement, pas une protection : md5 suffit.
  source_hash text not null,
  computed_at timestamptz not null default now()
);

comment on table public.listing_embeddings is
  'Embedding (gte-small, 384 dimensions) du titre + description d''une annonce. '
  'Écrit par la fonction Edge `embed` (service_role). Lisible exactement là où '
  'l''annonce l''est (politique déléguée à la RLS de `listings`). Voir 0016.';

-- Index HNSW en distance COSINUS : c'est l'opérateur `<=>` de la RPC.
create index if not exists listing_embeddings_embedding_hnsw_idx
  on public.listing_embeddings
  using hnsw (embedding extensions.vector_cosine_ops);

-- ── RLS : la visibilité des annonces, par délégation ──────────────────────
alter table public.listing_embeddings enable row level security;

drop policy if exists listing_embeddings_visible_sel on public.listing_embeddings;

create policy listing_embeddings_visible_sel on public.listing_embeddings
  for select to authenticated
  using (
    exists (
      select 1
      from public.listings l
      where l.id = listing_embeddings.listing_id
    )
  );

-- ── Privilèges : SELECT pour les connectés, rien pour anon ────────────────
-- Une table neuve de `public` arrive avec INSERT, UPDATE, DELETE et TRUNCATE
-- accordés à `anon` et `authenticated` (relevé de 0014). La RLS n'arrête pas
-- TRUNCATE ; le privilège, si.
revoke all on table public.listing_embeddings from public, anon, authenticated;
grant select on table public.listing_embeddings to authenticated;

-- ── Le texte source, en un seul endroit ───────────────────────────────────
-- Titre + description, espaces tassés, borné à 4 000 caractères (au-delà,
-- `gte-small` ne lit plus rien : 512 jetons). L'empreinte porte sur CE texte,
-- exactement celui qu'on embedde : un changement au-delà de la borne ne
-- déclenche aucun recalcul, et c'est juste.
create or replace function public.lh_embedding_source(
  p_title text,
  p_description text
) returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select left(
    btrim(
      regexp_replace(
        coalesce(p_title, '') || ' ' || coalesce(p_description, ''),
        '\s+', ' ', 'g'
      )
    ),
    4000
  )
$$;

-- ── Le reste à calculer, lu par `embed` ───────────────────────────────────
-- Les annonces sans embedding, dont le modèle a changé, ou dont le texte a
-- changé depuis le calcul — rien d'autre : une annonce revue sans changement
-- n'y reparaît pas. Les plus récentes d'abord. SECURITY INVOKER : appelée en
-- `service_role`, elle voit tout ; elle n'est accordée à personne d'autre.
create or replace function public.lh_embedding_backlog(
  p_model text,
  p_limit integer default 16
) returns table (listing_id uuid, source_text text, source_hash text)
language sql
stable
security invoker
set search_path = ''
as $$
  select c.id, c.src, md5(c.src)
  from (
    select
      l.id,
      l.first_seen_at,
      public.lh_embedding_source(l.title, l.description) as src
    from public.listings l
  ) c
  left join public.listing_embeddings e on e.listing_id = c.id
  where c.src <> ''
    and (
      e.listing_id is null
      or e.model is distinct from p_model
      or e.source_hash is distinct from md5(c.src)
    )
  order by c.first_seen_at desc, c.id
  limit greatest(1, least(coalesce(p_limit, 16), 256))
$$;

-- ── Les voisins d'une annonce, SOUS LA RLS de l'appelant ──────────────────
-- SECURITY INVOKER, pour que la RLS s'applique deux fois : à la RÉFÉRENCE (une
-- annonce invisible ne sert pas de sonde : rien n'est rendu, pas même une
-- erreur qui la distinguerait d'une annonce sans embedding) et aux VOISINS.
--
-- La référence est lue d'abord, dans une variable : l'ordre par distance à
-- une valeur fixe est ce qui rend l'index HNSW utilisable. Mais l'index est
-- APPROXIMATIF, et la RLS filtre ses candidats APRÈS lui : pour un appelant
-- qui ne voit qu'une petite part de la table, des voisins visibles peuvent
-- manquer à l'appel. `hnsw.ef_search` passe de 40 (défaut) à 100 pour la
-- marge ; à l'échelle de l'app, le planificateur préfère souvent le parcours
-- exact, et la question ne se pose pas.
create or replace function public.lh_embedding_neighbors(
  p_listing_id uuid,
  p_min_similarity double precision default 0.85,
  p_limit integer default 10
) returns table (listing_id uuid, similarity double precision)
language plpgsql
stable
security invoker
set search_path = public, extensions
set hnsw.ef_search = 100
as $$
#variable_conflict use_column
declare
  v_ref   extensions.vector;
  v_model text;
begin
  select e.embedding, e.model
    into v_ref, v_model
    from public.listing_embeddings e
   where e.listing_id = p_listing_id;

  if v_ref is null then
    return;
  end if;

  return query
    select e.listing_id,
           (1 - (e.embedding <=> v_ref))::double precision
      from public.listing_embeddings e
     where e.listing_id <> p_listing_id
       and e.model = v_model
       and 1 - (e.embedding <=> v_ref) >= coalesce(p_min_similarity, 0.85)
     order by e.embedding <=> v_ref
     limit least(greatest(coalesce(p_limit, 10), 1), 50);
end
$$;

-- ── Qui exécute quoi ──────────────────────────────────────────────────────
-- Une fonction neuve de `public` est exécutable d'office par PUBLIC, `anon`
-- et `authenticated` (droits par défaut de Supabase). Aucune des trois n'est
-- `security definer` — la RLS de l'appelant s'y applique quoi qu'il arrive —,
-- mais on ne laisse ouvert que ce qui sert :
--   · les voisins : aux connectés, ceux qui voient des annonces ;
--   · le reste à calculer et le texte source : à `service_role`, pour `embed`.
revoke all on function public.lh_embedding_source(text, text)
  from public, anon, authenticated;
grant execute on function public.lh_embedding_source(text, text)
  to service_role;

revoke all on function public.lh_embedding_backlog(text, integer)
  from public, anon, authenticated;
grant execute on function public.lh_embedding_backlog(text, integer)
  to service_role;

revoke all on function public.lh_embedding_neighbors(uuid, double precision, integer)
  from public, anon;
grant execute on function public.lh_embedding_neighbors(uuid, double precision, integer)
  to authenticated, service_role;
