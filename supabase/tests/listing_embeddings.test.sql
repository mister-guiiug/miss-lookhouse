-- ╔══════════════════════════════════════════════════════════════════════╗
-- ║ Miss LookHouse — embeddings (0016) : « visible si et seulement si     ║
-- ║ l'annonce l'est ».                                                    ║
-- ║                                                                        ║
-- ║ CE QUE CE FICHIER ÉTABLIT. La politique de `listing_embeddings`        ║
-- ║ DÉLÈGUE à la RLS de `listings` au lieu d'en recopier les trois         ║
-- ║ conditions (propriétaire, partage, catalogue public). Ce test compte,  ║
-- ║ pour trois comptes aux droits différents, les embeddings visibles ET   ║
-- ║ les annonces visibles : les deux ensembles doivent être égaux.         ║
-- ║                                                                        ║
-- ║ Puis la RPC des voisins, en SECURITY INVOKER : elle ne rend que des    ║
-- ║ voisins visibles, même quand un voisin invisible est plus proche, et   ║
-- ║ ne se laisse pas sonder par une annonce qu'on ne voit pas. Enfin le    ║
-- ║ « reste à calculer » lu par la fonction `embed` : seulement le neuf et ║
-- ║ le changé.                                                             ║
-- ║                                                                        ║
-- ║ Les vecteurs du test n'ont que trois composantes non nulles sur 384 :  ║
-- ║ les cosinus se calculent de tête, et chaque attendu est justifié.      ║
-- ╚══════════════════════════════════════════════════════════════════════╝

create extension if not exists pgtap with schema extensions;

set search_path to public, extensions;

begin;

select plan(41);

-- ── Outils du test (créés dans la transaction, donc annulés à la fin) ─────

-- Rend le SQLSTATE d'une instruction, ou « aucune erreur ». SECURITY INVOKER :
-- elle s'exécute sous le rôle courant, ce qui est l'intérêt.
create function lh_t_try(p_sql text) returns text language plpgsql as $fn$
begin
  execute p_sql;
  return 'aucune erreur';
exception
  when others then return sqlstate;
end
$fn$;

grant execute on function lh_t_try(text) to anon, authenticated;

-- Un vecteur de 384 dimensions dont seules les trois premières comptent.
create function lh_t_vec(p_x real, p_y real, p_z real)
returns extensions.vector language sql immutable as $fn$
  select (
    '[' || p_x || ',' || p_y || ',' || p_z || repeat(',0', 381) || ']'
  )::extensions.vector
$fn$;

-- L'empreinte que `lh_embedding_backlog` attend pour une annonce à jour.
create function lh_t_hash(p_listing uuid) returns text language sql as $fn$
  select md5(public.lh_embedding_source(l.title, l.description))
  from public.listings l
  where l.id = p_listing
$fn$;

-- Les embeddings que voit le rôle courant, triés.
create function lh_t_seen_embeddings() returns uuid[] language sql as $fn$
  select coalesce(array_agg(listing_id order by listing_id), '{}')
  from public.listing_embeddings
$fn$;

-- Parmi les annonces qui ONT un embedding, celles que voit le rôle courant.
create function lh_t_seen_listings(p_ids uuid[]) returns uuid[] language sql as $fn$
  select coalesce(array_agg(id order by id), '{}')
  from public.listings
  where id = any (p_ids)
$fn$;

-- ── Quatre comptes ────────────────────────────────────────────────────────
insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
values
  ('55555555-5555-5555-5555-555555555555', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'alice.emb@example.test', now(), now()),
  ('66666666-6666-6666-6666-666666666666', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'bob.emb@example.test', now(), now()),
  ('77777777-7777-7777-7777-777777777777', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'chloe.emb@example.test', now(), now()),
  ('88888888-8888-8888-8888-888888888888', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'catalogue.emb@example.test', now(), now());

-- Alice : une recherche privée. Bob : une recherche partagée avec Chloé.
-- Le compte « catalogue » : une recherche PUBLIQUE (0010).
insert into saved_searches (id, user_id, name, is_public)
values
  ('a0160000-0000-4000-8000-000000000001', '55555555-5555-5555-5555-555555555555',
   'Maison Clermont (privée)', false),
  ('b0160000-0000-4000-8000-000000000001', '66666666-6666-6666-6666-666666666666',
   'Appartement Riom (partagé)', false),
  ('c0160000-0000-4000-8000-000000000001', '88888888-8888-8888-8888-888888888888',
   'Agences 63 (public)', true);

insert into search_shares (search_id, owner_id, shared_with)
values (
  'b0160000-0000-4000-8000-000000000001',
  '66666666-6666-6666-6666-666666666666',
  '77777777-7777-7777-7777-777777777777'
);

-- `first_seen_at` explicite : l'ordre du « reste à calculer » en dépend.
insert into listings (
  id, user_id, source_id, external_id, title, description, search_id, first_seen_at
)
values
  -- LA1, LA2 : deux annonces d'Alice presque identiques ; LAX : sans rapport.
  ('a0160000-0000-4000-8000-00000000a001', '55555555-5555-5555-5555-555555555555',
   'import_generique', 'emb-a1', 'Maison 5 pièces avec jardin',
   'Proche écoles, garage double.', 'a0160000-0000-4000-8000-000000000001',
   '2026-09-01T10:00:00Z'),
  ('a0160000-0000-4000-8000-00000000a002', '55555555-5555-5555-5555-555555555555',
   'import_generique', 'emb-a2', 'Maison 5 pieces avec jardin',
   'Proche des écoles, garage double.', 'a0160000-0000-4000-8000-000000000001',
   '2026-09-02T10:00:00Z'),
  ('a0160000-0000-4000-8000-00000000a003', '55555555-5555-5555-5555-555555555555',
   'import_generique', 'emb-ax', 'Terrain agricole', 'Hors zone constructible.',
   'a0160000-0000-4000-8000-000000000001', '2026-09-03T10:00:00Z'),
  -- Pour le « reste à calculer » : sans embedding, empreinte périmée, autre
  -- modèle, et une annonce sans aucun texte.
  ('a0160000-0000-4000-8000-00000000a011', '55555555-5555-5555-5555-555555555555',
   'import_generique', 'emb-n1', 'Loft atelier', 'Verrière, 120 m².',
   'a0160000-0000-4000-8000-000000000001', '2026-09-20T10:00:00Z'),
  ('a0160000-0000-4000-8000-00000000a012', '55555555-5555-5555-5555-555555555555',
   'import_generique', 'emb-n2', 'Studio étudiant', 'Proche campus.',
   'a0160000-0000-4000-8000-000000000001', '2026-09-19T10:00:00Z'),
  ('a0160000-0000-4000-8000-00000000a013', '55555555-5555-5555-5555-555555555555',
   'import_generique', 'emb-n3', 'Fermette', 'Grange et four à pain.',
   'a0160000-0000-4000-8000-000000000001', '2026-09-18T10:00:00Z'),
  ('a0160000-0000-4000-8000-00000000a014', '55555555-5555-5555-5555-555555555555',
   'import_generique', 'emb-vide', null, '   ',
   'a0160000-0000-4000-8000-000000000001', '2026-09-21T10:00:00Z'),
  -- LB1 : l'annonce de Bob, partagée avec Chloé.
  ('b0160000-0000-4000-8000-00000000b001', '66666666-6666-6666-6666-666666666666',
   'import_generique', 'emb-b1', 'Maison 5 pièces, jardin',
   'Garage double, écoles à pied.', 'b0160000-0000-4000-8000-000000000001',
   '2026-09-04T10:00:00Z'),
  -- LP1 : le catalogue public.
  ('c0160000-0000-4000-8000-00000000c001', '88888888-8888-8888-8888-888888888888',
   'import_generique', 'emb-p1', 'Maison familiale avec jardin',
   'Écoles, garage.', 'c0160000-0000-4000-8000-000000000001',
   '2026-09-05T10:00:00Z');

-- Les embeddings, écrits comme `embed` les écrit : hors RLS.
--   cos(LA1, LA2) = 1/√1,01          ≈ 0,995
--   cos(LA1, LB1) = 1/√1,04          ≈ 0,981   (Bob : invisible pour Alice)
--   cos(LA1, LP1) = 1/√1,09          ≈ 0,958   (public)
--   cos(LB1, LP1) = 1/(√1,04·√1,09)  ≈ 0,939
--   LAX, LN2 : orthogonaux à LA1 (cosinus 0).
insert into listing_embeddings (listing_id, embedding, model, source_hash)
values
  ('a0160000-0000-4000-8000-00000000a001', lh_t_vec(1, 0, 0), 'gte-small',
   lh_t_hash('a0160000-0000-4000-8000-00000000a001')),
  ('a0160000-0000-4000-8000-00000000a002', lh_t_vec(1, 0.1, 0), 'gte-small',
   lh_t_hash('a0160000-0000-4000-8000-00000000a002')),
  ('a0160000-0000-4000-8000-00000000a003', lh_t_vec(0, 1, 0), 'gte-small',
   lh_t_hash('a0160000-0000-4000-8000-00000000a003')),
  ('a0160000-0000-4000-8000-00000000a012', lh_t_vec(0, 0, 1), 'gte-small',
   'empreinte-perimee'),
  ('a0160000-0000-4000-8000-00000000a013', lh_t_vec(1, 0, 0), 'ancien-modele',
   lh_t_hash('a0160000-0000-4000-8000-00000000a013')),
  ('b0160000-0000-4000-8000-00000000b001', lh_t_vec(1, 0.2, 0), 'gte-small',
   lh_t_hash('b0160000-0000-4000-8000-00000000b001')),
  ('c0160000-0000-4000-8000-00000000c001', lh_t_vec(1, 0, 0.3), 'gte-small',
   lh_t_hash('c0160000-0000-4000-8000-00000000c001'));

-- ╔══════════════════════════════════════════════════════════════════════╗
-- ║ 1. La structure telle que 0016 la pose.                               ║
-- ╚══════════════════════════════════════════════════════════════════════╝
select ok(
  (select relrowsecurity from pg_class where oid = 'public.listing_embeddings'::regclass),
  'la RLS est active sur listing_embeddings'
);

select is(
  (
    select array_agg(cmd || ' ' || array_to_string(roles, ','))
    from pg_policies
    where schemaname = 'public' and tablename = 'listing_embeddings'
  ),
  array['SELECT authenticated'],
  'une seule politique : la lecture, pour les connectés'
);

select is(
  (
    select atttypmod
    from pg_attribute
    where attrelid = 'public.listing_embeddings'::regclass
      and attname = 'embedding'
  ),
  384,
  'la colonne embedding a 384 dimensions (gte-small)'
);

select ok(
  exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and tablename = 'listing_embeddings'
      and indexdef ilike '%using hnsw%vector_cosine_ops%'
  ),
  'un index HNSW en distance cosinus couvre la colonne'
);

select ok(
  not (select prosecdef from pg_proc
       where oid = 'public.lh_embedding_neighbors(uuid,double precision,integer)'::regprocedure),
  'la RPC des voisins est SECURITY INVOKER : la RLS s''y applique'
);

select ok(
  not (select prosecdef from pg_proc
       where oid = 'public.lh_embedding_backlog(text,integer)'::regprocedure),
  '... et le « reste à calculer » aussi'
);

-- ╔══════════════════════════════════════════════════════════════════════╗
-- ║ 2. Les privilèges : SELECT pour les connectés, rien d'autre.          ║
-- ╚══════════════════════════════════════════════════════════════════════╝
select ok(
  has_table_privilege('authenticated', 'public.listing_embeddings', 'select'),
  'authenticated peut lire (la politique fera le tri)'
);

select ok(
  not has_table_privilege('authenticated', 'public.listing_embeddings', 'insert')
  and not has_table_privilege('authenticated', 'public.listing_embeddings', 'update')
  and not has_table_privilege('authenticated', 'public.listing_embeddings', 'delete')
  and not has_table_privilege('authenticated', 'public.listing_embeddings', 'truncate'),
  '... mais n''écrit, ne modifie, ne supprime ni ne vide rien'
);

select ok(
  not has_table_privilege('anon', 'public.listing_embeddings', 'select'),
  'anon ne lit rien'
);

select ok(
  has_function_privilege('authenticated',
    'public.lh_embedding_neighbors(uuid,double precision,integer)', 'execute'),
  'un connecté peut demander des voisins'
);

select ok(
  not has_function_privilege('anon',
    'public.lh_embedding_neighbors(uuid,double precision,integer)', 'execute'),
  '... pas un visiteur anonyme'
);

select ok(
  not has_function_privilege('anon', 'public.lh_embedding_backlog(text,integer)', 'execute')
  and not has_function_privilege('authenticated', 'public.lh_embedding_backlog(text,integer)', 'execute')
  and not has_function_privilege('anon', 'public.lh_embedding_source(text,text)', 'execute')
  and not has_function_privilege('authenticated', 'public.lh_embedding_source(text,text)', 'execute'),
  'le « reste à calculer » et le texte source ne sont ouverts ni à anon ni aux connectés'
);

select ok(
  has_function_privilege('service_role', 'public.lh_embedding_backlog(text,integer)', 'execute')
  and has_function_privilege('service_role', 'public.lh_embedding_source(text,text)', 'execute'),
  '... mais bien à service_role, sous lequel tourne la fonction embed'
);

-- ╔══════════════════════════════════════════════════════════════════════╗
-- ║ 3. La visibilité, EXACTEMENT celle des annonces.                      ║
-- ╚══════════════════════════════════════════════════════════════════════╝
-- Les annonces qui ont un embedding — la référence des comparaisons.
select set_config(
  'lh.with_embedding',
  (select array_agg(listing_id order by listing_id)::text from listing_embeddings),
  true
);

-- Alice : les siennes + le catalogue public. Pas l'annonce de Bob.
select set_config(
  'request.jwt.claims',
  '{"sub":"55555555-5555-5555-5555-555555555555","role":"authenticated"}',
  true
);
set role authenticated;

select is(
  lh_t_seen_embeddings(),
  lh_t_seen_listings(current_setting('lh.with_embedding')::uuid[]),
  'Alice : les embeddings visibles sont EXACTEMENT ceux de ses annonces visibles'
);

select is(
  cardinality(lh_t_seen_embeddings()),
  6,
  '... soit ses cinq (dont deux périmés) et celui du catalogue public'
);

select ok(
  not ('b0160000-0000-4000-8000-00000000b001'::uuid = any (lh_t_seen_embeddings())),
  '... et pas celui de Bob, qui ne lui est pas partagé'
);

-- Les écritures directes, refusées par le PRIVILÈGE (avant même la RLS).
select is(
  lh_t_try($$insert into public.listing_embeddings (listing_id, embedding, model, source_hash)
            values ('a0160000-0000-4000-8000-00000000a011',
                    (select embedding from public.listing_embeddings
                      where listing_id = 'a0160000-0000-4000-8000-00000000a001'),
                    'gte-small', 'x')$$),
  '42501',
  'Alice ne peut pas écrire un embedding, même pour son annonce'
);

select is(
  lh_t_try($$update public.listing_embeddings set model = 'forge'
            where listing_id = 'a0160000-0000-4000-8000-00000000a001'$$),
  '42501',
  '... ni en modifier un'
);

select is(
  lh_t_try($$delete from public.listing_embeddings
            where listing_id = 'a0160000-0000-4000-8000-00000000a001'$$),
  '42501',
  '... ni en supprimer un'
);

-- Les voisins de LA1 : LA2 (0,995) puis LP1 (0,958). LB1 (0,981) est plus
-- proche que LP1, mais invisible pour Alice : il ne sort pas.
select is(
  (
    select array_agg(listing_id order by similarity desc)
    from lh_embedding_neighbors('a0160000-0000-4000-8000-00000000a001', 0.9, 10)
  ),
  array[
    'a0160000-0000-4000-8000-00000000a002',
    'c0160000-0000-4000-8000-00000000c001'
  ]::uuid[],
  'voisins de LA1 pour Alice : les siens et le public, jamais ceux de Bob'
);

select ok(
  (
    select abs(similarity - 1 / sqrt(1.01)) < 0.001
    from lh_embedding_neighbors('a0160000-0000-4000-8000-00000000a001', 0.9, 10)
    where listing_id = 'a0160000-0000-4000-8000-00000000a002'
  ),
  '... avec la similarité cosinus attendue (1 − distance)'
);

select is(
  (
    select array_agg(listing_id)
    from lh_embedding_neighbors('a0160000-0000-4000-8000-00000000a001', 0.9, 1)
  ),
  array['a0160000-0000-4000-8000-00000000a002']::uuid[],
  'la limite est tenue (1 → le plus proche seul)'
);

select is(
  (
    select array_agg(listing_id)
    from lh_embedding_neighbors('a0160000-0000-4000-8000-00000000a001', 0.99, 10)
  ),
  array['a0160000-0000-4000-8000-00000000a002']::uuid[],
  'le seuil est tenu (0,99 → LP1 à 0,958 sort de la liste)'
);

select is(
  (
    select count(*)::int
    from lh_embedding_neighbors('a0160000-0000-4000-8000-00000000a001', 0.0, 10)
    where listing_id in (
      'a0160000-0000-4000-8000-00000000a013', -- autre modèle
      'a0160000-0000-4000-8000-00000000a001'  -- elle-même
    )
  ),
  0,
  'jamais l''annonce elle-même, jamais un vecteur d''un autre modèle'
);

reset role;

-- Bob : la sienne + le public.
select set_config(
  'request.jwt.claims',
  '{"sub":"66666666-6666-6666-6666-666666666666","role":"authenticated"}',
  true
);
set role authenticated;

select is(
  lh_t_seen_embeddings(),
  lh_t_seen_listings(current_setting('lh.with_embedding')::uuid[]),
  'Bob : les embeddings visibles sont EXACTEMENT ceux de ses annonces visibles'
);

select is(
  lh_t_seen_embeddings(),
  array[
    'b0160000-0000-4000-8000-00000000b001',
    'c0160000-0000-4000-8000-00000000c001'
  ]::uuid[],
  '... soit le sien et celui du catalogue public'
);

reset role;

-- Chloé : l'annonce de Bob par le PARTAGE (0006) + le public.
select set_config(
  'request.jwt.claims',
  '{"sub":"77777777-7777-7777-7777-777777777777","role":"authenticated"}',
  true
);
set role authenticated;

select is(
  lh_t_seen_embeddings(),
  lh_t_seen_listings(current_setting('lh.with_embedding')::uuid[]),
  'Chloé : les embeddings visibles sont EXACTEMENT ceux de ses annonces visibles'
);

select is(
  lh_t_seen_embeddings(),
  array[
    'b0160000-0000-4000-8000-00000000b001',
    'c0160000-0000-4000-8000-00000000c001'
  ]::uuid[],
  '... soit celui que Bob lui partage, et le public'
);

-- Une annonce invisible ne sert pas de sonde : rien, pas même une erreur.
select is(
  (
    select count(*)::int
    from lh_embedding_neighbors('a0160000-0000-4000-8000-00000000a001', 0.0, 50)
  ),
  0,
  'Chloé ne peut pas partir d''une annonce d''Alice : aucun voisin rendu'
);

-- Depuis l'annonce partagée : LP1 (0,939). LA1 et LA2, plus proches, sont à
-- Alice : ils ne sortent pas.
select is(
  (
    select array_agg(listing_id)
    from lh_embedding_neighbors('b0160000-0000-4000-8000-00000000b001', 0.9, 10)
  ),
  array['c0160000-0000-4000-8000-00000000c001']::uuid[],
  'voisins de l''annonce partagée pour Chloé : le public seul'
);

reset role;

-- anon : ni la table, ni la RPC. Les verdicts sont relevés sous `anon`, puis
-- comparés hors de ce rôle (le modèle de ingestion_privileges.test.sql).
select set_config('request.jwt.claims', '', true);
set role anon;

select set_config(
  'lh.anon_read',
  lh_t_try('select count(*) from public.listing_embeddings'),
  true
);
select set_config(
  'lh.anon_rpc',
  lh_t_try($$select * from public.lh_embedding_neighbors('c0160000-0000-4000-8000-00000000c001')$$),
  true
);

reset role;

select is(
  current_setting('lh.anon_read'),
  '42501',
  'anon : lecture refusée (permission denied)'
);

select is(
  current_setting('lh.anon_rpc'),
  '42501',
  'anon : la RPC des voisins est refusée'
);

-- ╔══════════════════════════════════════════════════════════════════════╗
-- ║ 4. Le « reste à calculer » : le neuf et le changé, rien d'autre.      ║
-- ╚══════════════════════════════════════════════════════════════════════╝
select is(
  (
    select array_agg(listing_id order by listing_id)
    from lh_embedding_backlog('gte-small', 50)
  ),
  array[
    'a0160000-0000-4000-8000-00000000a011', -- sans embedding
    'a0160000-0000-4000-8000-00000000a012', -- empreinte périmée
    'a0160000-0000-4000-8000-00000000a013'  -- autre modèle
  ]::uuid[],
  'reste à calculer : sans embedding, empreinte périmée, autre modèle — pas l''annonce sans texte'
);

select is(
  (select listing_id from lh_embedding_backlog('gte-small', 1)),
  'a0160000-0000-4000-8000-00000000a011'::uuid,
  'les plus récentes d''abord, et la limite est tenue'
);

select is(
  (
    select source_text
    from lh_embedding_backlog('gte-small', 50)
    where listing_id = 'a0160000-0000-4000-8000-00000000a011'
  ),
  'Loft atelier Verrière, 120 m².',
  'le texte source : titre et description, espaces tassés'
);

select is(
  (
    select source_hash
    from lh_embedding_backlog('gte-small', 50)
    where listing_id = 'a0160000-0000-4000-8000-00000000a011'
  ),
  md5('Loft atelier Verrière, 120 m².'),
  '... et son empreinte, celle que `embed` rangera'
);

select is(
  length(public.lh_embedding_source(repeat('x', 3000), repeat('y', 3000))),
  4000,
  'le texte source est borné à 4 000 caractères (gte-small ne lit que 512 jetons)'
);

-- Le titre de LA1 change : son embedding est périmé, il revient.
update listings
set title = 'Maison 5 pièces avec jardin et piscine'
where id = 'a0160000-0000-4000-8000-00000000a001';

select ok(
  'a0160000-0000-4000-8000-00000000a001'::uuid in (
    select listing_id from lh_embedding_backlog('gte-small', 50)
  ),
  'un texte modifié repasse dans le reste à calculer'
);

-- Un changement qui ne touche PAS le texte (le prix) ne coûte aucun calcul.
update listings
set price = 250000
where id = 'a0160000-0000-4000-8000-00000000a002';

select ok(
  not ('a0160000-0000-4000-8000-00000000a002'::uuid in (
    select listing_id from lh_embedding_backlog('gte-small', 50)
  )),
  '... mais pas une annonce dont seul le prix a changé'
);

-- Le service_role, sous lequel tourne `embed`, lit bien le reste à calculer :
-- les trois du départ, plus LA1 dont le titre vient de changer.
set role service_role;

select set_config(
  'lh.backlog_service_role',
  (select count(*)::text from lh_embedding_backlog('gte-small', 50)),
  true
);

reset role;

select is(
  current_setting('lh.backlog_service_role'),
  '4',
  'service_role lit le reste à calculer de TOUS les comptes (hors RLS)'
);

-- ╔══════════════════════════════════════════════════════════════════════╗
-- ║ 5. La cascade : une annonce supprimée emporte son embedding.          ║
-- ╚══════════════════════════════════════════════════════════════════════╝
delete from listings where id = 'a0160000-0000-4000-8000-00000000a002';

select is(
  (
    select count(*)::int
    from listing_embeddings
    where listing_id = 'a0160000-0000-4000-8000-00000000a002'
  ),
  0,
  'supprimer l''annonce supprime son embedding (on delete cascade)'
);

select *
from finish();

rollback;
