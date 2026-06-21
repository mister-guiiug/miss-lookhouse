-- ╔══════════════════════════════════════════════════════════════════════╗
-- ║ Miss LookHouse — Row Level Security (propriété par utilisateur,        ║
-- ║ deny-by-default). Aucune ligne n'est lisible/écrivable sans politique  ║
-- ║ explicite. La clé anon du bundle public est donc sûre.                 ║
-- ║                                                                        ║
-- ║ Modèle : chaque ligne porte `user_id` ; un utilisateur ne voit et ne   ║
-- ║ modifie QUE ses propres données (`user_id = auth.uid()`). Les jobs     ║
-- ║ planifiés (Edge Functions) utilisent la clé service_role (hors RLS) et ║
-- ║ renseignent explicitement `user_id` — la clé service_role ne quitte    ║
-- ║ jamais le serveur.                                                     ║
-- ╚══════════════════════════════════════════════════════════════════════╝

-- ── Helper : audit append-only via SECURITY DEFINER (contourne la RLS) ────
create or replace function lh_audit(
  p_action text, p_target_type text, p_target_id text, p_summary text
) returns void language plpgsql security definer set search_path = public as $$
begin
  insert into audit_logs (user_id, action, target_type, target_id, summary)
  values (auth.uid(), p_action, p_target_type, p_target_id, p_summary);
end $$;

-- ── Activation + forçage de la RLS sur TOUTES les tables ──────────────────
do $$
declare t text;
begin
  for t in select unnest(array[
    'profiles','sources','source_connectors','saved_searches',
    'listings','listing_versions','listing_price_history','listing_media',
    'listing_clusters','listing_similarity','listing_status','listing_notes',
    'listing_verifications','notifications','notification_preferences',
    'push_subscriptions','ingestion_runs','ingestion_events','audit_logs'
  ]) loop
    execute format('alter table %I enable row level security', t);
    execute format('alter table %I force row level security', t);
  end loop;
end $$;

-- ── Référentiel sources : lecture pour tous les authentifiés, écriture nulle
-- (réservée aux migrations / service_role). Pas de politique write => deny.
create policy sources_read on sources
  for select to authenticated using (true);

-- ── Profil : strictement personnel ────────────────────────────────────────
create policy profiles_self on profiles
  for select to authenticated using (id = auth.uid());
create policy profiles_upsert on profiles
  for insert to authenticated with check (id = auth.uid());
create policy profiles_update on profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- ── Helper-macro : politique « propriétaire » (CRUD complet sur ses lignes)
-- Générée dynamiquement pour chaque table utilisateur portant `user_id`.
do $$
declare t text;
begin
  for t in select unnest(array[
    'source_connectors','saved_searches','listings','listing_versions',
    'listing_price_history','listing_media','listing_clusters',
    'listing_similarity','listing_status','listing_notes',
    'listing_verifications','notifications','notification_preferences',
    'push_subscriptions','ingestion_runs','ingestion_events'
  ]) loop
    execute format(
      'create policy %1$s_owner_sel on %1$s for select to authenticated using (user_id = auth.uid())', t);
    execute format(
      'create policy %1$s_owner_ins on %1$s for insert to authenticated with check (user_id = auth.uid())', t);
    execute format(
      'create policy %1$s_owner_upd on %1$s for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid())', t);
    execute format(
      'create policy %1$s_owner_del on %1$s for delete to authenticated using (user_id = auth.uid())', t);
  end loop;
end $$;

-- ── Audit : lecture par le propriétaire, AUCUNE écriture directe ───────────
-- (les insertions passent par lh_audit() / triggers SECURITY DEFINER).
create policy audit_logs_owner_sel on audit_logs
  for select to authenticated using (user_id = auth.uid());

-- ╔══════════════════════════════════════════════════════════════════════╗
-- ║ Triggers d'audit serveur (actions importantes, auditabilité)          ║
-- ╚══════════════════════════════════════════════════════════════════════╝
create or replace function lh_log_search()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into audit_logs (user_id, action, target_type, target_id, summary)
      values (new.user_id, 'search.create', 'saved_search', new.id::text,
              format('Recherche « %s » créée.', new.name));
  elsif tg_op = 'UPDATE' and old.active <> new.active then
    insert into audit_logs (user_id, action, target_type, target_id, summary)
      values (new.user_id, 'search.toggle', 'saved_search', new.id::text,
              format('Recherche « %s » %s.', new.name,
                     case when new.active then 'activée' else 'désactivée' end));
  elsif tg_op = 'DELETE' then
    insert into audit_logs (user_id, action, target_type, target_id, summary)
      values (old.user_id, 'search.delete', 'saved_search', old.id::text,
              format('Recherche « %s » supprimée.', old.name));
  end if;
  return coalesce(new, old);
end $$;

create trigger saved_searches_audit
  after insert or update or delete on saved_searches
  for each row execute function lh_log_search();

create or replace function lh_log_status()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into audit_logs (user_id, action, target_type, target_id, summary)
    values (new.user_id, 'listing.status', 'listing', new.listing_id::text,
            format('Statut → %s.', new.status));
  return new;
end $$;

create trigger listing_status_audit
  after insert or update on listing_status
  for each row execute function lh_log_status();

-- ╔══════════════════════════════════════════════════════════════════════╗
-- ║ Stockage privé des médias (bucket `listing-media`) — politiques        ║
-- ║ activées seulement si le bucket existe (cf. supabase/README.md).       ║
-- ╚══════════════════════════════════════════════════════════════════════╝
do $$
begin
  if exists (select 1 from storage.buckets where id = 'listing-media') then
    execute $p$
      create policy listing_media_read on storage.objects for select to authenticated
        using (bucket_id = 'listing-media' and owner = auth.uid());
    $p$;
    execute $p$
      create policy listing_media_write on storage.objects for insert to authenticated
        with check (bucket_id = 'listing-media' and owner = auth.uid());
    $p$;
    execute $p$
      create policy listing_media_delete on storage.objects for delete to authenticated
        using (bucket_id = 'listing-media' and owner = auth.uid());
    $p$;
  end if;
end $$;
