-- Miss LookHouse : 0020, lh_audit et lh_share_search fermées au visiteur anonyme.
--
-- LE DÉFAUT CORRIGÉ. Supabase accorde EXECUTE à `anon` sur toute fonction
-- créée dans `public`, par un privilège PAR DÉFAUT explicite, et PostgreSQL
-- l'accorde en plus à PUBLIC, dont `anon` hérite. 0002 et 0008 accordaient
-- EXECUTE à `authenticated` sans rien retirer : la clé anon, publique puisqu'elle
-- est dans le bundle de la PWA, pouvait donc
--   - appeler `lh_audit` et écrire dans `audit_logs` une ligne sans
--     utilisateur ;
--   - appeler `lh_share_search`, dont la garde `v_owner <> auth.uid()` vaut
--     NULL quand `auth.uid()` l'est : `if NULL` ne lève pas, et l'appel allait
--     jusqu'à l'insertion (qui échouait, `owner_id` étant NOT NULL).
-- Aucun visiteur anonyme n'a à les appeler. Relevé le 29/09/2026 par
-- `supabase/tests/structure-securite.test.sql`, qui les listait « à fermer ».
--
-- LE CORRECTIF. On retire `public` ET `anon` : retirer l'un ne retire pas
-- l'autre. `authenticated` garde son droit (l'application partage, et
-- `rls_force_security_definer.test.sql` appelle `lh_audit` en compte
-- connecté). La garde de `lh_share_search` passe à `is distinct from`, pour
-- qu'un appelant sans session soit refusé même si un droit revenait ; le
-- reste du corps est celui de 0008, inchangé.

revoke all on function lh_audit(text, text, text, text) from public, anon;
grant execute on function lh_audit(text, text, text, text) to authenticated;

create or replace function lh_share_search(
  p_search_id uuid, p_email text, p_role text default 'viewer'
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_owner  uuid;
  v_target uuid;
begin
  select user_id into v_owner from saved_searches where id = p_search_id;
  -- Sans session, auth.uid() est NULL : `<>` rendrait NULL, que `if` ne traite
  -- pas comme vrai. `is distinct from` rend true, et l'appel est refusé.
  if v_owner is null or v_owner is distinct from auth.uid() then
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

revoke all on function lh_share_search(uuid, text, text) from public, anon;
grant execute on function lh_share_search(uuid, text, text) to authenticated;
