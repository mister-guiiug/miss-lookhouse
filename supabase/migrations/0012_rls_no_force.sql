-- ╔══════════════════════════════════════════════════════════════════════╗
-- ║ Miss LookHouse — retrait de FORCE ROW LEVEL SECURITY.                 ║
-- ║                                                                        ║
-- ║ `enable` reste. Seul `force` part. L'isolation par compte est INTACTE. ║
-- ╚══════════════════════════════════════════════════════════════════════╝
--
-- CE QUE 0002 A POSÉ, ET POURQUOI ÇA SE CONTREDISAIT
--
-- 0002 pose `force row level security` sur dix-neuf tables (0006 en ajoute une
-- vingtième) ET écrit dans `audit_logs` depuis des fonctions `security
-- definer`, sous le commentaire « contourne la RLS ».
--
-- Les deux ne peuvent pas être vrais ensemble. `force` soumet AUSSI le
-- propriétaire des tables aux politiques ; une fonction `security definer`
-- s'exécute justement sous ce propriétaire. Sous `force`, elle ne contourne
-- donc plus rien — et `audit_logs` n'a aucune politique d'écriture.
--
-- CE QUE LA MESURE A MONTRÉ (supabase/tests/, exécuté en CI)
--
--   propriétaire de audit_logs   : postgres
--   rolbypassrls(postgres)       : true      <<<
--   rolsuper(postgres)           : false
--   politiques d'écriture        : 0
--
-- L'attribut de rôle BYPASSRLS l'emporte sur `force`. Rien n'est donc cassé
-- aujourd'hui : les quinze assertions de comportement passent. Mais il faut
-- lire ce résultat pour ce qu'il est — `force` n'a jamais rien protégé ici.
-- Il ne s'applique qu'au propriétaire, et ce propriétaire le contourne.
--
-- Le `rolsuper = false` est la ligne qui rend la mesure transposable : le rôle
-- local n'est pas superutilisateur, il ne « passe » donc pas pour une raison
-- que l'hébergé n'aurait pas. C'est bien BYPASSRLS qui opère, des deux côtés.
--
-- POURQUOI LE RETIRER PLUTÔT QUE LE GARDER
--
-- Garder `force` reviendrait à faire dépendre le fonctionnement de TOUTE
-- l'application d'un attribut de rôle qui ne nous appartient pas. Le jour où
-- `postgres` perdrait BYPASSRLS, ce ne serait pas l'audit qui tomberait : les
-- triggers de 0002 écrivent dans `audit_logs` à chaque écriture sur
-- `saved_searches` et `listing_status`. Créer une recherche — la fonction
-- principale de l'app — échouerait. `lh_list_shares()` rendrait, elle, une
-- liste VIDE sans erreur : le mode d'échec silencieux, le pire des deux.
--
-- Et ce qu'on abandonne en le retirant est exactement nul : `force` ne change
-- le sort que du propriétaire, qui le contourne déjà. Zéro protection perdue,
-- une dépendance cachée en moins.
--
-- Ce que `force` protégerait s'il opérait — une connexion directe sous le rôle
-- propriétaire — n'existe pas via l'API : PostgREST se connecte en
-- `authenticator` puis bascule en `anon`, `authenticated` ou `service_role`.
-- Le raisonnement complet est celui du projet voisin mister-miss-koh,
-- docs/politiques-rls.md, « FORCE ROW LEVEL SECURITY est écarté,
-- volontairement ».
--
-- Idempotent : rejouable sans effet de bord.

-- ── Retrait de `force` partout où 0002/0006 l'avaient posé ────────────────
-- Balayage plutôt que liste en dur : une liste recopiée oublie la table
-- ajoutée après coup — c'est précisément comme ça que `search_shares` (0006)
-- s'est retrouvée hors de celle de 0002.
do $$
declare
  t regclass;
  n int := 0;
begin
  for t in
    select c.oid::regclass
    from pg_class c
    join pg_namespace ns on ns.oid = c.relnamespace
    where ns.nspname = 'public'
      and c.relkind = 'r'
      and c.relforcerowsecurity
  loop
    execute format('alter table %s no force row level security', t);
    n := n + 1;
  end loop;
  raise notice '0012 : FORCE retiré de % table(s).', n;
end $$;

-- ── Garde : `enable` doit être resté sur toutes les tables applicatives ────
-- Sans lui, l'isolation par compte disparaîtrait pour de bon. On échoue fort
-- plutôt que de laisser passer une table ouverte.
do $$
declare
  ouvertes text;
begin
  select string_agg(c.relname, ', ' order by c.relname)
    into ouvertes
  from pg_class c
  join pg_namespace ns on ns.oid = c.relnamespace
  where ns.nspname = 'public'
    and c.relkind = 'r'
    and not c.relrowsecurity;

  if ouvertes is not null then
    raise exception
      '0012 : ces tables n''ont PAS la RLS activée : %. Retirer `force` ne doit jamais laisser une table sans `enable`.',
      ouvertes;
  end if;
end $$;

-- ── Le commentaire de 0002 affirmait un contournement qui n'avait pas lieu ─
comment on function lh_audit(text, text, text, text) is
  'Audit append-only. SECURITY DEFINER pour s''exécuter sous le propriétaire '
  '(postgres) : c''est l''attribut BYPASSRLS de CE rôle — et non le SECURITY '
  'DEFINER en lui-même — qui franchit la RLS. La distinction compte : sous '
  '`force row level security`, le SECURITY DEFINER ne contournerait rien. '
  'Voir 0012_rls_no_force.sql et supabase/tests/.';
