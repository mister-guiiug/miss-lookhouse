-- ╔══════════════════════════════════════════════════════════════════════╗
-- ║ Miss LookHouse — Partage de recherches (V3).                          ║
-- ║                                                                        ║
-- ║ Un propriétaire partage une recherche (et ses annonces) avec un autre  ║
-- ║ compte, en LECTURE. Implémenté par des policies RLS ADDITIONNELLES     ║
-- ║ (combinées en OR avec les policies « owner » de 0002) — l'isolation    ║
-- ║ par défaut reste intacte. Le partage en ÉCRITURE (role 'editor') est   ║
-- ║ réservé (colonne présente) mais PAS encore accordé : la synchro        ║
-- ║ offline-first réécrit `user_id`, ce qui détournerait la propriété.     ║
-- ╚══════════════════════════════════════════════════════════════════════╝

create type share_role as enum ('viewer', 'editor');

create table if not exists search_shares (
  id          uuid primary key default gen_random_uuid(),
  search_id   uuid not null references saved_searches (id) on delete cascade,
  owner_id    uuid not null references auth.users (id) on delete cascade,
  shared_with uuid not null references auth.users (id) on delete cascade,
  role        share_role not null default 'viewer',
  created_at  timestamptz not null default now(),
  unique (search_id, shared_with),
  check (owner_id <> shared_with)
);
create index if not exists search_shares_with_idx on search_shares (shared_with);
create index if not exists search_shares_search_idx on search_shares (search_id);

alter table search_shares enable row level security;
alter table search_shares force row level security;

-- Le propriétaire gère les partages de SES recherches ; le destinataire voit
-- les partages qui le concernent (pour savoir « partagé par qui »).
create policy search_shares_owner_all on search_shares
  for all to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());
create policy search_shares_recipient_sel on search_shares
  for select to authenticated
  using (shared_with = auth.uid());

-- ── Accès PARTAGÉ en lecture (policies additionnelles → OR avec « owner ») ──
create policy saved_searches_shared_sel on saved_searches
  for select to authenticated
  using (
    exists (
      select 1 from search_shares sh
      where sh.search_id = saved_searches.id and sh.shared_with = auth.uid()
    )
  );

create policy listings_shared_sel on listings
  for select to authenticated
  using (
    search_id is not null and exists (
      select 1 from search_shares sh
      where sh.search_id = listings.search_id and sh.shared_with = auth.uid()
    )
  );

-- ── Partage / révocation par e-mail (SECURITY DEFINER) ──
-- Résout l'e-mail en user_id côté serveur (sans exposer auth.users au client).
-- Vérifie que l'appelant possède la recherche. Renvoie l'id du destinataire.
create or replace function lh_share_search(
  p_search_id uuid, p_email text, p_role text default 'viewer'
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_owner  uuid;
  v_target uuid;
begin
  select user_id into v_owner from saved_searches where id = p_search_id;
  if v_owner is null then raise exception 'Recherche introuvable.'; end if;
  if v_owner <> auth.uid() then raise exception 'Non autorisé.'; end if;

  select id into v_target from auth.users
    where lower(email) = lower(trim(p_email)) limit 1;
  if v_target is null then raise exception 'Aucun compte pour cet e-mail.'; end if;
  if v_target = auth.uid() then
    raise exception 'Impossible de partager avec soi-même.';
  end if;

  insert into search_shares (search_id, owner_id, shared_with, role)
    values (p_search_id, auth.uid(), v_target, p_role::share_role)
    on conflict (search_id, shared_with) do update set role = excluded.role;
  return v_target;
end $$;

create or replace function lh_unshare_search(
  p_search_id uuid, p_user_id uuid
) returns void language plpgsql security definer set search_path = public as $$
begin
  delete from search_shares
   where search_id = p_search_id
     and shared_with = p_user_id
     and owner_id = auth.uid();
end $$;

grant execute on function lh_share_search(uuid, text, text) to authenticated;
grant execute on function lh_unshare_search(uuid, uuid) to authenticated;
