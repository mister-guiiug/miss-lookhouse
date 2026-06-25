-- ╔══════════════════════════════════════════════════════════════════════╗
-- ║ Miss LookHouse — Catalogue PUBLIC partagé.                            ║
-- ║                                                                        ║
-- ║ Une recherche marquée `is_public` (ex. « Agences 63 » du compte        ║
-- ║ système) et ses annonces sont LISIBLES par tous les utilisateurs       ║
-- ║ authentifiés. Implémenté par des policies RLS ADDITIONNELLES (OR avec   ║
-- ║ les policies « owner » de 0002) → l'isolation par défaut reste intacte. ║
-- ║ L'écriture reste réservée au propriétaire/au service_role (ingest-*).   ║
-- ╚══════════════════════════════════════════════════════════════════════╝

alter table saved_searches
  add column if not exists is_public boolean not null default false;
create index if not exists saved_searches_public_idx
  on saved_searches (is_public) where is_public;

-- ── Lecture PARTAGÉE (policies additionnelles → OR avec « owner ») ──────────
create policy saved_searches_public_sel on saved_searches
  for select to authenticated
  using (is_public);

create policy listings_public_sel on listings
  for select to authenticated
  using (
    search_id is not null and exists (
      select 1 from saved_searches s
      where s.id = listings.search_id and s.is_public
    )
  );

create policy listing_price_history_public_sel on listing_price_history
  for select to authenticated
  using (
    exists (
      select 1 from listings l
      join saved_searches s on s.id = l.search_id
      where l.id = listing_price_history.listing_id and s.is_public
    )
  );

create policy listing_similarity_public_sel on listing_similarity
  for select to authenticated
  using (
    exists (
      select 1 from listings l
      join saved_searches s on s.id = l.search_id
      where l.id = listing_similarity.listing_a and s.is_public
    )
  );
