-- ╔══════════════════════════════════════════════════════════════════════╗
-- ║ Miss LookHouse — lister les partages d'une recherche (avec e-mail).   ║
-- ║ SECURITY DEFINER : joint auth.users côté serveur (le client ne peut    ║
-- ║ pas lire auth.users). Réservé au PROPRIÉTAIRE de la recherche.         ║
-- ╚══════════════════════════════════════════════════════════════════════╝
create or replace function lh_list_shares(p_search_id uuid)
returns table (shared_with uuid, email text, role share_role)
language plpgsql security definer set search_path = public as $$
begin
  if not exists (
    select 1 from saved_searches
    where id = p_search_id and user_id = auth.uid()
  ) then
    raise exception 'Non autorisé.';
  end if;
  return query
    select sh.shared_with, u.email::text, sh.role
    from search_shares sh
    join auth.users u on u.id = sh.shared_with
    where sh.search_id = p_search_id
    order by sh.created_at;
end $$;

grant execute on function lh_list_shares(uuid) to authenticated;
