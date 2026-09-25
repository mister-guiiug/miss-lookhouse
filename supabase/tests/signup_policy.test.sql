-- ╔══════════════════════════════════════════════════════════════════════╗
-- ║ Miss LookHouse — politique d'inscription (0018) : le hook « Before    ║
-- ║ User Created », appelé comme Supabase Auth l'appelle.                 ║
-- ║                                                                        ║
-- ║ CE QUE CE FICHIER ÉTABLIT.                                             ║
-- ║   1. Le contrat : l'entrée est l'évènement documenté par Supabase      ║
-- ║      (`metadata` + `user`), la sortie `{}` pour laisser passer, et     ║
-- ║      `{"error":{"http_code":403,"message":…}}` pour refuser.           ║
-- ║   2. La politique : `open` laisse tout passer ; `invite` ne laisse     ║
-- ║      passer que la liste, sans égard à la casse ni aux espaces ; sans  ║
-- ║      réglage, on échoue FERMÉ.                                         ║
-- ║   3. La porte : `supabase_auth_admin` seul exécute la fonction, et les ║
-- ║      deux tables ne s'ouvrent à aucun client.                          ║
-- ║                                                                        ║
-- ║ POURQUOI UN APPEL DIRECT SUFFIT. La fonction est `security definer` :  ║
-- ║ elle lit les tables sous son propriétaire, quel que soit l'appelant.   ║
-- ║ L'appel sous `postgres` rend donc exactement ce que Supabase Auth      ║
-- ║ recevra sous `supabase_auth_admin` — rôle que ce test ne peut pas      ║
-- ║ endosser (`postgres` n'en est pas membre, relevé par                   ║
-- ║ delete_my_account.test.sql). Ce qui dépend de l'appelant, le droit     ║
-- ║ d'exécution et l'usage du schéma, est vérifié à part (§ 3).            ║
-- ╚══════════════════════════════════════════════════════════════════════╝

create extension if not exists pgtap with schema extensions;

set search_path to public, extensions;

begin;

select plan(22);

create function lh_t_try(p_sql text) returns text language plpgsql as $fn$
begin
  execute p_sql;
  return 'aucune erreur';
exception
  when others then return sqlstate;
end
$fn$;

grant execute on function lh_t_try(text) to anon, authenticated;

-- L'évènement tel que le documente Supabase (auth-hooks/before-user-created-
-- hook) : l'utilisateur n'existe pas encore, `id` et dates sont provisoires.
create function lh_t_event(p_email text, p_provider text default 'email')
returns jsonb language sql immutable as $fn$
  select jsonb_build_object(
    'metadata', jsonb_build_object(
      'uuid', '8b34dcdd-9df1-4c10-850a-b3277c653040',
      'time', '2026-09-25T10:00:00.000000+02:00',
      'name', 'before-user-created',
      'ip_address', '127.0.0.1'
    ),
    'user', jsonb_build_object(
      'id', 'ff7fc9ae-3b1b-4642-9241-64adb9848a03',
      'aud', 'authenticated',
      'role', '',
      'email', p_email,
      'phone', '',
      'app_metadata', jsonb_build_object(
        'provider', p_provider,
        'providers', jsonb_build_array(p_provider)
      ),
      'user_metadata', '{}'::jsonb,
      'identities', '[]'::jsonb,
      'created_at', '0001-01-01T00:00:00Z',
      'updated_at', '0001-01-01T00:00:00Z',
      'is_anonymous', false
    )
  )
$fn$;

-- Le refus attendu, mot pour mot : le front le reconnaît à « sur invitation ».
create function lh_t_refus() returns jsonb language sql immutable as $fn$
  select '{"error": {"http_code": 403, "message": "L''inscription est sur invitation."}}'::jsonb
$fn$;

-- Une invitation saisie avec des majuscules et des espaces : la comparaison
-- doit les ignorer.
insert into signup_allowlist (email, note)
values ('  Invitee@Example.TEST ', 'test pgTAP');

-- ╔══════════════════════════════════════════════════════════════════════╗
-- ║ 1. Le réglage : un singleton, `invite` par défaut.                    ║
-- ╚══════════════════════════════════════════════════════════════════════╝
select is(
  (select array_agg(signup_mode) from app_settings),
  array['invite'],
  'une seule ligne de réglage, en mode invite par défaut'
);

select is(
  lh_t_try($$insert into public.app_settings (id) values (true)$$),
  '23505',
  'pas de seconde ligne (clé)'
);

select is(
  lh_t_try($$insert into public.app_settings (id) values (false)$$),
  '23514',
  '... ni de ligne « false » (CHECK du singleton)'
);

select is(
  lh_t_try($$update public.app_settings set signup_mode = 'closed'$$),
  '23514',
  'signup_mode ne vaut que open ou invite'
);

select is(
  lh_t_try($$insert into public.signup_allowlist (email) values ('INVITEE@example.test')$$),
  '23505',
  'une même adresse ne s''invite pas deux fois, casse ou pas'
);

-- ╔══════════════════════════════════════════════════════════════════════╗
-- ║ 2. Le hook, appelé comme Supabase Auth l'appelle.                     ║
-- ╚══════════════════════════════════════════════════════════════════════╝
select is(
  lh_before_user_created(lh_t_event('inconnu@example.test')),
  lh_t_refus(),
  'invite : une adresse hors liste est refusée — 403 et le message attendu'
);

select is(
  lh_before_user_created(lh_t_event('invitee@example.test')),
  '{}'::jsonb,
  'invite : l''adresse invitée passe (la liste la portait en majuscules et entre espaces)'
);

select is(
  lh_before_user_created(lh_t_event('INVITEE@EXAMPLE.TEST')),
  '{}'::jsonb,
  '... quelle que soit la casse de la demande'
);

select is(
  lh_before_user_created(lh_t_event('invitee@example.test', 'google')),
  '{}'::jsonb,
  '... et quel que soit le fournisseur (OAuth compris)'
);

select is(
  lh_before_user_created(lh_t_event('')),
  lh_t_refus(),
  'invite : sans adresse (téléphone, connexion anonyme), refus'
);

select is(
  lh_before_user_created('{}'::jsonb),
  lh_t_refus(),
  'invite : un évènement sans utilisateur est refusé, sans lever d''erreur'
);

select is(
  (lh_before_user_created(lh_t_event('inconnu@example.test')) -> 'error' ->> 'http_code')::int,
  403,
  'le code HTTP du refus est un nombre, 403'
);

-- Le mode ouvert.
update app_settings set signup_mode = 'open';

select is(
  lh_before_user_created(lh_t_event('inconnu@example.test')),
  '{}'::jsonb,
  'open : tout le monde passe'
);

-- La ligne vient de la migration, jouée dans une transaction ANTÉRIEURE : sans
-- le déclencheur, `updated_at` garderait son heure, pas celle-ci.
select is(
  (select updated_at from app_settings),
  now(),
  'le changement de mode est daté (déclencheur updated_at)'
);

-- Le réglage effacé par erreur : on échoue FERMÉ.
delete from app_settings;

select is(
  lh_before_user_created(lh_t_event('inconnu@example.test')),
  lh_t_refus(),
  'sans réglage, le hook se comporte comme en invite (échec fermé)'
);

-- ╔══════════════════════════════════════════════════════════════════════╗
-- ║ 3. La porte : Supabase Auth seul.                                     ║
-- ╚══════════════════════════════════════════════════════════════════════╝
select ok(
  (select prosecdef from pg_proc
    where oid = 'public.lh_before_user_created(jsonb)'::regprocedure),
  'le hook est SECURITY DEFINER (voir l''en-tête de 0018)'
);

select ok(
  (select proconfig @> array['search_path=""'] from pg_proc
    where oid = 'public.lh_before_user_created(jsonb)'::regprocedure),
  '... avec un search_path vide (noms qualifiés, pas de détournement)'
);

select ok(
  has_function_privilege('supabase_auth_admin', 'public.lh_before_user_created(jsonb)', 'execute')
  and has_schema_privilege('supabase_auth_admin', 'public', 'usage'),
  'supabase_auth_admin peut l''appeler (exécution + usage du schéma)'
);

select ok(
  not has_function_privilege('public', 'public.lh_before_user_created(jsonb)', 'execute')
  and not has_function_privilege('anon', 'public.lh_before_user_created(jsonb)', 'execute')
  and not has_function_privilege('authenticated', 'public.lh_before_user_created(jsonb)', 'execute')
  and not has_function_privilege('service_role', 'public.lh_before_user_created(jsonb)', 'execute'),
  '... et personne d''autre : ni PUBLIC, ni anon, ni authenticated, ni service_role'
);

select ok(
  (select relrowsecurity from pg_class where oid = 'public.app_settings'::regclass)
  and (select relrowsecurity from pg_class where oid = 'public.signup_allowlist'::regclass)
  and not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename in ('app_settings', 'signup_allowlist')
  ),
  'les deux tables : RLS active et aucune politique'
);

select ok(
  not has_table_privilege('anon', 'public.signup_allowlist', 'select')
  and not has_table_privilege('authenticated', 'public.signup_allowlist', 'select')
  and not has_table_privilege('authenticated', 'public.signup_allowlist', 'insert')
  and not has_table_privilege('anon', 'public.app_settings', 'select')
  and not has_table_privilege('authenticated', 'public.app_settings', 'select')
  and not has_table_privilege('authenticated', 'public.app_settings', 'update'),
  '... et aucun privilège pour anon ni authenticated'
);

-- L'appel réel, sous `anon`, comme le ferait PostgREST
-- (`POST /rest/v1/rpc/lh_before_user_created`) pour sonder la liste.
select set_config('request.jwt.claims', '', true);
set role anon;
select set_config(
  'lh.hook_anon',
  lh_t_try($$select public.lh_before_user_created('{"user":{"email":"invitee@example.test"}}'::jsonb)$$),
  true
);
reset role;

select is(
  current_setting('lh.hook_anon'),
  '42501',
  'anon ne peut pas appeler le hook pour sonder la liste (permission denied)'
);

select *
from finish();

rollback;
