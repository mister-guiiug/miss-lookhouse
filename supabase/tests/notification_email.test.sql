-- ╔══════════════════════════════════════════════════════════════════════╗
-- ║ Miss LookHouse — le canal e-mail de `notify` (0017) : le contrat dont ║
-- ║ il dépend.                                                            ║
-- ║                                                                        ║
-- ║ Le canal ne demande aucune colonne neuve. Il repose sur trois faits    ║
-- ║ plus anciens, qu'aucun test n'épinglait :                              ║
-- ║   1. l'opt-in `email_enabled` vaut `false` tant que la personne ne l'a ║
-- ║      pas posé — sinon on écrirait à qui n'a rien demandé ;             ║
-- ║   2. seule la personne le pose, sur SA ligne — sinon un tiers ferait   ║
-- ║      écrire à une autre adresse que la sienne… ou l'en priverait ;     ║
-- ║   3. le statut de livraison (`delivery`, où l'e-mail rejoint webhook   ║
-- ║      et push) n'est pas écrivable par le client — sinon « e-mail ✓ »   ║
-- ║      se forgerait.                                                     ║
-- ╚══════════════════════════════════════════════════════════════════════╝

create extension if not exists pgtap with schema extensions;

set search_path to public, extensions;

begin;

select plan(10);

create function lh_t_try(p_sql text) returns text language plpgsql as $fn$
begin
  execute p_sql;
  return 'aucune erreur';
exception
  when others then return sqlstate;
end
$fn$;

grant execute on function lh_t_try(text) to authenticated;

insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
values
  ('91919191-9191-9191-9191-919191919191', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'emma.mail@example.test', now(), now()),
  ('92929292-9292-9292-9292-929292929292', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'farid.mail@example.test', now(), now());

-- Farid a déjà une ligne de préférences, créée par le push : sans e-mail.
insert into notification_preferences (user_id, webpush_enabled)
values ('92929292-9292-9292-9292-929292929292', true);

insert into notifications (id, user_id, type, title, body)
values (
  'e0170000-0000-4000-8000-000000000001',
  '91919191-9191-9191-9191-919191919191',
  'new_listing', 'Nouvelle annonce', 'Maison 5 pièces — 289000 €'
);

-- ── 0. La documentation de la base ────────────────────────────────────────
select ok(
  col_description(
    'public.notifications'::regclass,
    (select attnum from pg_attribute
      where attrelid = 'public.notifications'::regclass and attname = 'delivery')
  ) like '%email%',
  'le commentaire de notifications.delivery nomme le canal e-mail'
);

-- ── 1. L'opt-in est à false tant que personne ne l'a posé ─────────────────
select is(
  (select email_enabled from notification_preferences
    where user_id = '92929292-9292-9292-9292-929292929292'),
  false,
  'une ligne de préférences créée sans y penser n''abonne pas à l''e-mail'
);

-- ── 2. Chacun pose le sien, et seulement le sien ──────────────────────────
select set_config(
  'request.jwt.claims',
  '{"sub":"91919191-9191-9191-9191-919191919191","role":"authenticated"}',
  true
);
set role authenticated;

-- Le geste exact du front (src/backend/notificationPreferences.ts) : un
-- upsert sur `user_id`.
select is(
  lh_t_try($$insert into public.notification_preferences (user_id, email_enabled)
            values ('91919191-9191-9191-9191-919191919191', true)
            on conflict (user_id) do update set email_enabled = excluded.email_enabled$$),
  'aucune erreur',
  'Emma s''abonne elle-même à l''e-mail'
);

select is(
  (select email_enabled from notification_preferences
    where user_id = '91919191-9191-9191-9191-919191919191'),
  true,
  '... et c''est enregistré'
);

select is(
  lh_t_try($$insert into public.notification_preferences (user_id, email_enabled)
            values ('92929292-9292-9292-9292-929292929292', true)
            on conflict (user_id) do update set email_enabled = excluded.email_enabled$$),
  '42501',
  'Emma ne peut pas abonner Farid (la RLS refuse la ligne d''un autre)'
);

select is(
  (select count(*)::int from notification_preferences
    where user_id = '92929292-9292-9292-9292-929292929292'),
  0,
  '... ni même voir ses préférences'
);

-- Une mise à jour visant la ligne d'un autre ne lève rien : elle ne voit
-- aucune ligne. On vérifie donc, après coup, que rien n'a bougé.
select lh_t_try($$update public.notification_preferences set email_enabled = true
                 where user_id = '92929292-9292-9292-9292-929292929292'$$);

-- ── 3. Le statut de livraison ne se forge pas ─────────────────────────────
select is(
  lh_t_try($$update public.notifications
            set delivery = '{"channels":{"email":"sent"}}'::jsonb
            where id = 'e0170000-0000-4000-8000-000000000001'$$),
  '42501',
  'Emma ne peut pas écrire « e-mail ✓ » sur sa propre notification'
);

select is(
  lh_t_try($$update public.notifications set read_at = now()
            where id = 'e0170000-0000-4000-8000-000000000001'$$),
  'aucune erreur',
  '... elle peut toujours la marquer lue (la seule colonne qui lui revient)'
);

reset role;

select is(
  (select email_enabled from notification_preferences
    where user_id = '92929292-9292-9292-9292-929292929292'),
  false,
  'Farid n''a pas été abonné dans son dos'
);

select ok(
  not has_column_privilege('authenticated', 'public.notifications', 'delivery', 'update')
  and not has_column_privilege('authenticated', 'public.notifications', 'dispatched_at', 'update')
  and has_column_privilege('authenticated', 'public.notifications', 'read_at', 'update'),
  'côté privilèges : read_at seul, ni delivery ni dispatched_at (0009)'
);

select *
from finish();

rollback;
