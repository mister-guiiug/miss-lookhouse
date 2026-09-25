-- Miss LookHouse — 0019 — la vue des recherches dues n'est plus publique.
--
-- LE DÉFAUT CORRIGÉ. `lh_due_searches` (0004) liste les recherches actives à
-- relancer : identifiant, PROPRIÉTAIRE, NOM, fréquence, dernier passage. Une
-- vue s'exécute par défaut avec les droits de son propriétaire, `postgres`,
-- qui porte BYPASSRLS : la RLS de `saved_searches` ne la filtrait donc pas.
-- Et une vue neuve de `public` arrive lisible par `anon` et `authenticated`.
-- La clé anon, publique puisqu'elle est dans le bundle de la PWA, suffisait
-- donc à lire par `GET /rest/v1/lh_due_searches` le nom des recherches de tous
-- les comptes (« T3 Lyon 7e < 350 k€ »…) et leur propriétaire. Relevé le
-- 25/09/2026, pendant le chantier des embeddings.
--
-- Seule l'Edge Function `ingest-run` la lit, avec la clé `service_role`.
--
-- DEUX BARRIÈRES, INDÉPENDANTES, comme 0014 pour `keep_alive` :
--   - `security_invoker` : la vue subit désormais la RLS de `saved_searches`.
--     Un client qui la lirait malgré tout ne verrait que ses propres lignes ;
--   - les privilèges : `anon` et `authenticated` n'y ont plus accès du tout.
--     `service_role` garde le sien.
--
-- Rejouable sans effet de bord.

alter view public.lh_due_searches set (security_invoker = true);

revoke all on table public.lh_due_searches from anon, authenticated;
