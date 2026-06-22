-- ╔══════════════════════════════════════════════════════════════════════╗
-- ║ Miss LookHouse — partage : message neutre (anti-énumération d'e-mail). ║
-- ║                                                                        ║
-- ║ L'ancienne lh_share_search levait « Aucun compte pour cet e-mail. »    ║
-- ║ → permettait de tester si une adresse a un compte. On la rend NEUTRE : ║
-- ║ si l'adresse n'a pas de compte (ou = soi-même), no-op SILENCIEUX.      ║
-- ║ (Changement de type de retour uuid→void ⇒ drop + create.)             ║
-- ╚══════════════════════════════════════════════════════════════════════╝
drop function if exists lh_share_search(uuid, text, text);

create function lh_share_search(
  p_search_id uuid, p_email text, p_role text default 'viewer'
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_owner  uuid;
  v_target uuid;
begin
  select user_id into v_owner from saved_searches where id = p_search_id;
  if v_owner is null or v_owner <> auth.uid() then
    raise exception 'Non autorisé.';
  end if;

  select id into v_target from auth.users
    where lower(email) = lower(trim(p_email)) limit 1;
  -- Neutre : aucun compte (ou soi-même) → on ne fait rien et on ne le révèle pas.
  if v_target is null or v_target = auth.uid() then
    return;
  end if;

  insert into search_shares (search_id, owner_id, shared_with, role)
    values (p_search_id, auth.uid(), v_target, p_role::share_role)
    on conflict (search_id, shared_with) do update set role = excluded.role;
end $$;

grant execute on function lh_share_search(uuid, text, text) to authenticated;
