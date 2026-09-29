-- miss-lookhouse : deux invariants de sécurité de la base. pgTAP, joué par
-- `supabase test db` sur la pile jetable de la CI.
--
-- 1. Aucune table de `public` sans RLS. Supabase expose `public` à la clé
--    anon du bundle : une table sans RLS y est ouverte à quiconque a cette
--    clé, dans la limite de ses privilèges.
-- 2. Les fonctions SECURITY DEFINER qu'`anon` peut exécuter forment une liste
--    RELUE. Une telle fonction s'exécute sous son propriétaire (`postgres`,
--    qui porte BYPASSRLS) : elle contourne la RLS, et seul son propre
--    contrôle de l'appelant protège les données. Supabase accorde EXECUTE à
--    `anon` sur toute fonction créée dans `public`, par un privilège PAR
--    DÉFAUT, et `revoke … from public` ne le retire pas : il faut nommer
--    `anon`. Une fonction neuve absente de la liste fait échouer ce test :
--    lui retirer `anon`, ou l'ajouter après avoir relu son contrôle de
--    l'appelant.
--
-- Le même fichier vit dans chaque application Supabase du parc (29/09/2026).
-- Les tables et fonctions d'une extension ne relèvent pas des migrations :
-- elles sont écartées.

create extension if not exists pgtap with schema extensions;

set search_path to public, extensions;

begin;

select plan(2);

select is_empty(
  $$
    select c.relname::text
      from pg_class c
     where c.relnamespace = 'public'::regnamespace
       and c.relkind in ('r', 'p')
       and not c.relrowsecurity
       and not exists (
         select 1 from pg_depend d
          where d.classid = 'pg_class'::regclass
            and d.objid = c.oid
            and d.deptype = 'e'
       )
  $$,
  'aucune table de public sans RLS'
);

select set_eq(
  $$
    select p.proname::text
      from pg_proc p
     where p.pronamespace = 'public'::regnamespace
       and p.prokind = 'f'
       and p.prosecdef
       and p.prorettype not in ('trigger'::regtype, 'event_trigger'::regtype)
       and has_function_privilege('anon', p.oid, 'execute')
       and not exists (
         select 1 from pg_depend d
          where d.classid = 'pg_proc'::regclass
            and d.objid = p.oid
            and d.deptype = 'e'
       )
  $$,
  array[
    -- Ne touchent que les recherches de l'appelant
    'lh_list_shares',
    'lh_unshare_search'
    -- lh_audit et lh_share_search en sont sorties avec 0020.
  ],
  'les fonctions SECURITY DEFINER exécutables par anon sont exactement la liste relue'
);

select * from finish();

rollback;
