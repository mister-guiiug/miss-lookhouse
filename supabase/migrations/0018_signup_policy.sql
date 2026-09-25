-- ╔══════════════════════════════════════════════════════════════════════╗
-- ║ Miss LookHouse — 0018 — politique d'inscription : ouverte ou sur       ║
-- ║ invitation, tranchée par un hook « Before User Created ».              ║
-- ╚══════════════════════════════════════════════════════════════════════╝
--
-- SANS EFFET TANT QUE LE HOOK N'EST PAS ACTIVÉ. Cette migration pose le
-- réglage, la liste et la fonction ; elle n'active rien. C'est l'exploitant
-- qui branche le hook (tableau de bord › Authentication › Hooks › « Before
-- User Created » › fonction Postgres `public.lh_before_user_created`) et qui
-- choisit donc la politique. Marche à suivre : supabase/README.md, §4.
--
-- LE CONTRAT DU HOOK, VÉRIFIÉ LE 25/09/2026 dans la documentation Supabase
-- (guides/auth/auth-hooks/before-user-created-hook) et dans le code de Supabase
-- Auth (internal/hooks/hookspgfunc, internal/hooks/hookserrors) :
--   · Supabase Auth exécute `select public.lh_before_user_created($1)` sous le
--     rôle `supabase_auth_admin`, dans sa propre transaction, avec un délai de
--     2 s ; l'entrée est `{ "metadata": {…}, "user": { "email": …,
--     "app_metadata": { "provider": … }, … } }` ;
--   · rendre `{}` laisse créer le compte ; rendre
--     `{ "error": { "http_code": 403, "message": … } }` le refuse, et le client
--     reçoit une erreur HTTP 403 portant ce message ;
--   · le hook part AVANT toute création de compte : inscription par mot de
--     passe, lien magique vers une adresse inconnue, invitation
--     (`inviteUserByEmail`), OAuth, SSO, connexion anonyme. Pas la création
--     directe par l'administrateur (tableau de bord › « Add user », ou
--     `auth.admin.createUser`) : c'est la voie des comptes manuels.
--
-- DÉFAUT : `invite`. Une fois le hook activé, une adresse hors liste ne crée
-- plus de compte ; les comptes EXISTANTS ne sont jamais concernés (le hook ne
-- part qu'à la création). Comparaison insensible à la casse et aux espaces de
-- bord. Réglage absent (ligne effacée) = `invite` : on échoue fermé.
--
-- SECURITY DEFINER, À DESSEIN, ET À UNE SEULE PORTE. La documentation
-- Supabase recommande `security invoker` pour les hooks, avec des droits de
-- lecture et une politique RLS accordés à `supabase_auth_admin` sur les tables
-- lues. Mais la CI ne peut pas endosser ce rôle (mesuré : `postgres` n'en est
-- pas membre sur la pile de test), donc ne pourrait pas prouver qu'il lit
-- vraiment la liste — et un droit manquant ferait échouer TOUTE inscription en
-- 500 « Error running hook URI », quelle que soit la politique. En `security
-- definer` (propriétaire `postgres`, `search_path` vide), le comportement ne
-- dépend plus des droits de l'appelant : le test l'éprouve tel quel. La
-- contrepartie est tenue par les privilèges : EXÉCUTION à
-- `supabase_auth_admin` SEUL, retirée à PUBLIC, `anon`, `authenticated` et
-- `service_role` — sinon n'importe qui, clé anon en main, sonderait la liste
-- par `POST /rest/v1/rpc/lh_before_user_created`.
--
-- LES TABLES NE S'OUVRENT À PERSONNE : RLS active et aucune politique, tous
-- privilèges retirés à `anon` et `authenticated`. On les gère en SQL ou depuis
-- le tableau de bord (Table Editor), sous `postgres` — il n'y a pas de rôle
-- d'administrateur dans l'app, et on n'en invente pas un pour ça.
--
-- RGPD. La liste contient des adresses : celles que l'exploitant a invitées.
-- `delete_my_account()` (0013) ne la touche pas — ce n'est pas une donnée du
-- compte, et l'effacer rouvrirait la porte à qui ne l'a plus. Retirer une
-- adresse de la liste reste un geste de l'exploitant.
--
-- Additive et rejouable : `if not exists`, `on conflict do nothing`,
-- `create or replace`, déclencheur supprimé puis recréé.

-- ── Le réglage d'application, singleton ───────────────────────────────────
create table if not exists public.app_settings (
  -- Toujours `true` : une seule ligne possible, par la clé ET par le CHECK.
  id          boolean primary key default true,
  signup_mode text not null default 'invite',
  updated_at  timestamptz not null default now(),
  constraint app_settings_singleton check (id),
  constraint app_settings_signup_mode check (signup_mode in ('open', 'invite'))
);

comment on table public.app_settings is
  'Réglages d''application (une seule ligne). signup_mode : open | invite '
  '(défaut invite), lu par le hook Before User Created — sans effet tant que '
  'le hook n''est pas activé. Voir 0018.';

insert into public.app_settings (id) values (true) on conflict (id) do nothing;

-- `lh_touch_updated_at()` vient de 0001 : savoir QUAND la politique a changé.
drop trigger if exists app_settings_touch on public.app_settings;
create trigger app_settings_touch
  before update on public.app_settings
  for each row execute function public.lh_touch_updated_at();

-- ── La liste des adresses invitées ────────────────────────────────────────
create table if not exists public.signup_allowlist (
  email      text primary key,
  note       text,
  created_at timestamptz not null default now(),
  constraint signup_allowlist_email_shape check (position('@' in email) > 1)
);

comment on table public.signup_allowlist is
  'Adresses autorisées à créer un compte quand signup_mode = invite. '
  'Comparaison insensible à la casse. Gérée en SQL ou au tableau de bord. '
  'Voir 0018.';

-- Unicité INSENSIBLE à la casse : « Alice@x.fr » et « alice@x.fr » sont la
-- même invitation. C'est aussi l'index de la recherche du hook.
create unique index if not exists signup_allowlist_email_ci_idx
  on public.signup_allowlist (lower(btrim(email)));

-- ── Fermées à tout client ─────────────────────────────────────────────────
alter table public.app_settings enable row level security;
alter table public.signup_allowlist enable row level security;

revoke all on table public.app_settings from public, anon, authenticated;
revoke all on table public.signup_allowlist from public, anon, authenticated;

-- ── Le hook ───────────────────────────────────────────────────────────────
create or replace function public.lh_before_user_created(event jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_mode  text;
  v_email text := lower(btrim(coalesce(event -> 'user' ->> 'email', '')));
begin
  select s.signup_mode into v_mode
    from public.app_settings s
   where s.id;

  if coalesce(v_mode, 'invite') = 'open' then
    return '{}'::jsonb;
  end if;

  -- Sur invitation. Sans adresse (téléphone, connexion anonyme), personne
  -- n'est sur la liste : refus.
  if v_email <> '' and exists (
    select 1
      from public.signup_allowlist a
     where lower(btrim(a.email)) = v_email
  ) then
    return '{}'::jsonb;
  end if;

  -- Le message est lu tel quel par le front, qui le reconnaît à « sur
  -- invitation » (src/auth/inscription.ts) : le changer, c'est changer les deux.
  return jsonb_build_object(
    'error', jsonb_build_object(
      'http_code', 403,
      'message', 'L''inscription est sur invitation.'
    )
  );
end
$$;

-- Propriétaire explicite, comme 0013 : c'est SON attribut BYPASSRLS qui lit
-- les deux tables fermées. Le laisser implicite ferait dépendre le hook du
-- rôle qui a appliqué la migration.
alter function public.lh_before_user_created(jsonb) owner to postgres;

comment on function public.lh_before_user_created(jsonb) is
  'Hook Supabase Auth « Before User Created ». Mode open : {} ; mode invite : '
  '{} si l''adresse est dans signup_allowlist (casse ignorée), sinon '
  '{"error":{"http_code":403,"message":"L''inscription est sur invitation."}}. '
  'SECURITY DEFINER, exécutable par supabase_auth_admin SEUL. Voir 0018.';

-- Supabase accorde d'office EXECUTE sur les fonctions de `public` à `anon`,
-- `authenticated` et `service_role`, en plus de PUBLIC par PostgreSQL : on les
-- nomme toutes. Une seule porte reste : Supabase Auth.
revoke all on function public.lh_before_user_created(jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.lh_before_user_created(jsonb)
  to supabase_auth_admin;

-- Pour appeler `public.lh_before_user_created`, il faut d'abord voir le schéma.
grant usage on schema public to supabase_auth_admin;
