-- ╔══════════════════════════════════════════════════════════════════════╗
-- ║ Miss LookHouse — supprimer son compte : « après, plus une ligne ».    ║
-- ║                                                                        ║
-- ║ CE QUE CE FICHIER ÉTABLIT. 0013 pose `delete_my_account()` sur une     ║
-- ║ hypothèse que ce parc n'avait jamais vérifiée : qu'une fonction        ║
-- ║ `security definer` appartenant à `postgres` puisse supprimer une ligne ║
-- ║ d'`auth.users`. Supabase le documente ; personne ici ne l'avait        ║
-- ║ exécuté. Le poste de développement n'a pas de démon Docker — la CI est ║
-- ║ le seul endroit où cette question reçoit une réponse.                  ║
-- ║                                                                        ║
-- ║ La réponse tient en une ligne de diagnostic (le droit de DELETE de     ║
-- ║ `postgres` sur `auth.users`) et une assertion de comportement (l'appel ║
-- ║ passe, et il ne reste rien). Les deux sont là : le droit seul pourrait ║
-- ║ exister sans que la cascade aboutisse, et un appel qui « ne plante     ║
-- ║ pas » ne prouve rien — le mode d'échec redouté ici est le SILENCE, une ║
-- ║ suppression filtrée qui rend zéro ligne effacée sans lever d'erreur.   ║
-- ║ On compte donc les lignes, avant et après.                             ║
-- ║                                                                        ║
-- ║ Le décompte est un BALAYAGE du catalogue, comme la fonction : un test  ║
-- ║ qui énumérerait les tables à la main vieillirait exactement au même    ║
-- ║ rythme que la liste qu'il est censé surveiller.                        ║
-- ╚══════════════════════════════════════════════════════════════════════╝

create extension if not exists pgtap with schema extensions;

set search_path to public, extensions;

begin;

select plan(16);

-- ── Outils du test (créés dans la transaction, donc annulés à la fin) ─────

-- Toutes les lignes qui DÉSIGNENT un utilisateur : balayage des tables de
-- `public` portant `user_id uuid`, plus les deux que ce balayage ne peut pas
-- voir (`profiles.id`, `search_shares.owner_id`/`shared_with`). Même règle que
-- 0013 — si l'une des deux dérive, le test le dira.
create function lh_t_rows_for(p_uid uuid) returns int
language plpgsql as $fn$
declare
  t text;
  n int;
  total int := 0;
begin
  for t in
    select c.relname
    from pg_class c
    join pg_namespace ns on ns.oid = c.relnamespace
    join pg_attribute a
      on a.attrelid = c.oid
     and a.attname = 'user_id'
     and a.attnum > 0
     and not a.attisdropped
     and a.atttypid = 'uuid'::regtype
    where ns.nspname = 'public' and c.relkind = 'r'
    order by c.relname
  loop
    execute format('select count(*) from public.%I where user_id = $1', t)
      into n using p_uid;
    total := total + n;
  end loop;

  select count(*) into n from public.profiles where id = p_uid;
  total := total + n;
  select count(*) into n from public.search_shares
    where owner_id = p_uid or shared_with = p_uid;
  return total + n;
end
$fn$;

-- Ce qui resterait, table par table — pour que l'échec soit lisible du
-- premier coup d'œil dans le journal d'Actions plutôt qu'un « 3 attendu 0 ».
create function lh_t_leftovers(p_uid uuid) returns text
language plpgsql as $fn$
declare
  t text;
  n int;
  acc text := '';
begin
  for t in
    select c.relname
    from pg_class c
    join pg_namespace ns on ns.oid = c.relnamespace
    join pg_attribute a
      on a.attrelid = c.oid
     and a.attname = 'user_id'
     and a.attnum > 0
     and not a.attisdropped
     and a.atttypid = 'uuid'::regtype
    where ns.nspname = 'public' and c.relkind = 'r'
    order by c.relname
  loop
    execute format('select count(*) from public.%I where user_id = $1', t)
      into n using p_uid;
    if n > 0 then acc := acc || t || '=' || n || ' '; end if;
  end loop;
  return coalesce(nullif(acc, ''), '(rien)');
end
$fn$;

-- Rendre le SQLSTATE plutôt que de plaider auprès de `throws_ok` — surchargée,
-- et aucune combinaison de casts ne l'avait résolue dans le test voisin.
-- SECURITY INVOKER : elle s'exécute sous le rôle courant, ce qui est l'intérêt.
create function lh_t_try(p_sql text) returns text language plpgsql as $fn$
begin
  execute p_sql;
  return 'aucune erreur';
exception
  when others then return sqlstate;
end
$fn$;

-- ── Deux comptes de test ──────────────────────────────────────────────────
insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
values
  (
    '33333333-3333-3333-3333-333333333333',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'chloe@example.test',
    now(),
    now()
  ),
  (
    '44444444-4444-4444-4444-444444444444',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'david@example.test',
    now(),
    now()
  );

-- ── Un projet immobilier complet pour Chloé, un embryon pour David ────────
-- Le test ne vaut que si Chloé a réellement des lignes partout : une
-- suppression réussie sur une base vide ne prouverait rien (assertion 7).

insert into profiles (id, email, display_name, rgpd_consent_at)
values
  ('33333333-3333-3333-3333-333333333333', 'chloe@example.test', 'Chloé', now()),
  ('44444444-4444-4444-4444-444444444444', 'david@example.test', 'David', now());

insert into saved_searches (
  id, user_id, name, source_ids, city, center_lat, center_lng, radius_km,
  price_min, price_max, surface_min, rooms_min, property_types,
  keywords_required, keywords_excluded, frequency
)
values
  (
    'aaaa1111-0000-4000-8000-000000000001',
    '33333333-3333-3333-3333-333333333333',
    'Maison Clermont-Ferrand',
    array['import_generique'],
    'Clermont-Ferrand', 45.7772, 3.0870, 12,
    150000, 320000, 80, 4, array['maison'],
    array['jardin'], array['travaux'], 'hourly'
  ),
  (
    'bbbb1111-0000-4000-8000-000000000001',
    '44444444-4444-4444-4444-444444444444',
    'Appartement Riom',
    array['import_generique'],
    'Riom', null, null, null,
    null, 180000, null, null, array['appartement'],
    array[]::text[], array[]::text[], 'daily'
  );

insert into listing_clusters (id, user_id, label, kind)
values (
  'aaaa3333-0000-4000-8000-000000000001',
  '33333333-3333-3333-3333-333333333333',
  'Doublons probables', 'probable_identique'
);

insert into listings (
  id, user_id, source_id, external_id, title, price, surface_m2, rooms,
  search_id, cluster_id
)
values
  (
    'aaaa2222-0000-4000-8000-000000000001',
    '33333333-3333-3333-3333-333333333333',
    'import_generique', 'ext-1', 'Maison 5 pièces', 289000, 110, 5,
    'aaaa1111-0000-4000-8000-000000000001',
    'aaaa3333-0000-4000-8000-000000000001'
  ),
  (
    'aaaa2222-0000-4000-8000-000000000002',
    '33333333-3333-3333-3333-333333333333',
    'import_generique', 'ext-2', 'Maison 5 pieces', 285000, 110, 5,
    'aaaa1111-0000-4000-8000-000000000001',
    'aaaa3333-0000-4000-8000-000000000001'
  ),
  (
    'bbbb2222-0000-4000-8000-000000000001',
    '44444444-4444-4444-4444-444444444444',
    'import_generique', 'ext-b1', 'T3 centre', 165000, 62, 3,
    'bbbb1111-0000-4000-8000-000000000001', null
  );

-- `listing_versions` alimente `listing_price_history` par trigger (0001) :
-- deux tables peuplées d'un coup, dont une qu'on n'écrit jamais à la main.
insert into listing_versions (user_id, listing_id, price, title)
values (
  '33333333-3333-3333-3333-333333333333',
  'aaaa2222-0000-4000-8000-000000000001',
  289000, 'Maison 5 pièces'
);

insert into listing_media (user_id, listing_id, url, phash)
values (
  '33333333-3333-3333-3333-333333333333',
  'aaaa2222-0000-4000-8000-000000000001',
  'https://example.test/photo.jpg', 'ff00ff00ff00ff00'
);

insert into listing_similarity (user_id, listing_a, listing_b, score, bucket)
values (
  '33333333-3333-3333-3333-333333333333',
  'aaaa2222-0000-4000-8000-000000000001',
  'aaaa2222-0000-4000-8000-000000000002',
  92, 'probable_identique'
);

-- Écrit aussi une ligne d'audit (trigger `listing_status_audit`, 0002).
insert into listing_status (listing_id, user_id, status, tags)
values (
  'aaaa2222-0000-4000-8000-000000000001',
  '33333333-3333-3333-3333-333333333333',
  'interessante', array['coup de coeur']
);

insert into listing_notes (user_id, listing_id, body)
values (
  '33333333-3333-3333-3333-333333333333',
  'aaaa2222-0000-4000-8000-000000000001',
  'Visite prévue samedi.'
);

insert into listing_verifications (user_id, listing_id, verified, confidence)
values (
  '33333333-3333-3333-3333-333333333333',
  'aaaa2222-0000-4000-8000-000000000001',
  true, 80
);

insert into notifications (user_id, type, title, body, listing_id)
values (
  '33333333-3333-3333-3333-333333333333',
  'price_drop', 'Baisse de prix', '-4 000 €',
  'aaaa2222-0000-4000-8000-000000000001'
);

insert into notification_preferences (user_id, email_enabled, webhook_url)
values (
  '33333333-3333-3333-3333-333333333333', true, 'https://hooks.example.test/x'
);

insert into push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
values (
  '33333333-3333-3333-3333-333333333333',
  'https://push.example.test/abc', 'p256dh-value', 'auth-value', 'Firefox/1.0'
);

insert into ingestion_runs (id, user_id, search_id, trigger, status)
values (
  'aaaa4444-0000-4000-8000-000000000001',
  '33333333-3333-3333-3333-333333333333',
  'aaaa1111-0000-4000-8000-000000000001', 'manual', 'success'
);

insert into ingestion_events (user_id, run_id, level, step, message)
values (
  '33333333-3333-3333-3333-333333333333',
  'aaaa4444-0000-4000-8000-000000000001',
  'info', 'collect', '2 annonces collectées.'
);

insert into source_connectors (user_id, source_id, label, mode)
values (
  '33333333-3333-3333-3333-333333333333',
  'import_generique', 'Mon import', 'manual_import'
);

-- Un partage DONNÉ et un partage REÇU : la ligne reçue ne porte pas de
-- `user_id`, c'est celle que le balayage seul laisserait derrière.
insert into search_shares (search_id, owner_id, shared_with)
values
  (
    'aaaa1111-0000-4000-8000-000000000001',
    '33333333-3333-3333-3333-333333333333',
    '44444444-4444-4444-4444-444444444444'
  ),
  (
    'bbbb1111-0000-4000-8000-000000000001',
    '44444444-4444-4444-4444-444444444444',
    '33333333-3333-3333-3333-333333333333'
  );

-- ╔══════════════════════════════════════════════════════════════════════╗
-- ║ 1. Les faits, imprimés — la ligne qui répond à la question.           ║
-- ╚══════════════════════════════════════════════════════════════════════╝
select diag(
  'propriétaire de auth.users            : '
  || (select pg_get_userbyid(relowner) from pg_class where oid = 'auth.users'::regclass)
);

select diag(
  'has_table_privilege(postgres, auth.users, DELETE) : '
  || has_table_privilege('postgres', 'auth.users', 'delete')::text
  || '   <<< LA réponse : une fonction SECURITY DEFINER de postgres peut-elle effacer un compte ?'
);

select diag(
  'rolsuper(postgres)                    : '
  || (select rolsuper::text from pg_roles where rolname = 'postgres')
  || '   <<< false => le droit vient d''un GRANT, pas du superutilisateur'
);

select diag(
  'postgres est-il membre de supabase_auth_admin ? '
  || coalesce(
       (
         select pg_has_role('postgres', 'supabase_auth_admin', 'member')::text
         from pg_roles
         where rolname = 'supabase_auth_admin'
       ),
       'rôle absent'
     )
);

select diag('lignes de Chloé avant : ' || lh_t_rows_for('33333333-3333-3333-3333-333333333333')::text);

-- ╔══════════════════════════════════════════════════════════════════════╗
-- ║ 2. La fonction telle que 0013 la pose.                                ║
-- ╚══════════════════════════════════════════════════════════════════════╝
select ok(
  (select prosecdef from pg_proc where oid = 'public.delete_my_account()'::regprocedure),
  'delete_my_account() est SECURITY DEFINER'
);

select is(
  (select proowner from pg_proc where oid = 'public.delete_my_account()'::regprocedure),
  (select relowner from pg_class where oid = 'public.audit_logs'::regclass),
  '... et appartient au même rôle que les tables (postgres) — la prémisse de 0013'
);

select ok(
  has_function_privilege('authenticated', 'public.delete_my_account()', 'execute'),
  'un utilisateur connecté peut l''appeler'
);

-- Les droits par défaut de Supabase nomment `anon` : révoquer PUBLIC ne
-- suffisait pas. Sans cette révocation, un visiteur non connecté pourrait
-- appeler la fonction (elle refuserait, mais la surface serait ouverte).
select ok(
  not has_function_privilege('anon', 'public.delete_my_account()', 'execute'),
  '... et un visiteur anonyme, non'
);

-- L'HYPOTHÈSE. Si cette assertion tombe un jour, 0013 ne peut plus tenir sa
-- promesse et le repli est l'anonymisation (modèle `anonymize_doctor` de
-- mister-doc) — laquelle laisse un compte derrière elle.
select ok(
  has_table_privilege('postgres', 'auth.users', 'delete'),
  'le propriétaire des fonctions a le droit de DELETE sur auth.users'
);

-- ╔══════════════════════════════════════════════════════════════════════╗
-- ║ 3. Sans session, elle refuse — plutôt que d''effacer au hasard.       ║
-- ╚══════════════════════════════════════════════════════════════════════╝
select set_config('request.jwt.claims', '', true);
set role authenticated;

select is(
  lh_t_try($$select public.delete_my_account()$$),
  '42501'::text,
  'sans session (auth.uid() null), l''appel est refusé'
);

reset role;

select is(
  (
    select count(*)::int from auth.users
    where id in (
      '33333333-3333-3333-3333-333333333333',
      '44444444-4444-4444-4444-444444444444'
    )
  ),
  2,
  '... et les deux comptes sont toujours là'
);

-- ╔══════════════════════════════════════════════════════════════════════╗
-- ║ 4. Le comportement : Chloé supprime son compte.                       ║
-- ╚══════════════════════════════════════════════════════════════════════╝

-- Garde anti-test-creux : réussir à ne rien effacer n'est pas réussir.
select ok(
  lh_t_rows_for('33333333-3333-3333-3333-333333333333') > 0,
  'avant l''appel, Chloé a bien des lignes à perdre'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}',
  true
);
set role authenticated;

select lives_ok(
  $$select public.delete_my_account()$$,
  'l''appel aboutit pour l''utilisateur connecté (y compris le DELETE sur auth.users)'
);

reset role;

select diag('lignes restantes de Chloé : ' || lh_t_leftovers('33333333-3333-3333-3333-333333333333'));

select is(
  lh_t_rows_for('33333333-3333-3333-3333-333333333333'),
  0,
  'après suppression, plus une ligne ne désigne Chloé'
);

select is(
  (select count(*)::int from auth.users where id = '33333333-3333-3333-3333-333333333333'),
  0,
  '... et son compte a disparu d''auth.users : c''est une suppression, pas une anonymisation'
);

-- `audit_logs.user_id` est `on delete set null` : sans le passage explicite de
-- 0013, la cascade laisserait ici des lignes sans personne, mais avec IP et
-- user-agent. Zéro ligne orpheline = le passage a bien eu lieu.
select is(
  (select count(*)::int from audit_logs where user_id is null),
  0,
  '... sans laisser d''audit orphelin (le `on delete set null` de la cascade)'
);

-- ╔══════════════════════════════════════════════════════════════════════╗
-- ║ 5. Et le voisin n'a rien perdu.                                       ║
-- ╚══════════════════════════════════════════════════════════════════════╝
select ok(
  lh_t_rows_for('44444444-4444-4444-4444-444444444444') > 0,
  'David, lui, a gardé ses lignes'
);

select is(
  (select count(*)::int from saved_searches where user_id = '44444444-4444-4444-4444-444444444444'),
  1,
  '... dont sa recherche, que Chloé avait pourtant reçue en partage'
);

select is(
  (select count(*)::int from search_shares),
  0,
  'les deux partages (donné ET reçu) sont partis avec elle'
);

-- La lecture de David sous RLS : les politiques permissives se combinent par
-- OU (owner, partagée, publique). Une fois Chloé effacée, l'union se réduit à
-- ses propres lignes — et pas à zéro, ce qui serait l'autre façon de rater.
select set_config(
  'request.jwt.claims',
  '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}',
  true
);
set role authenticated;

select is(
  (select count(*)::int from saved_searches),
  1,
  'David voit sa recherche, et elle seule'
);

reset role;

select *
from finish();

rollback;
