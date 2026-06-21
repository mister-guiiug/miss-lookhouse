# Backend Supabase — Miss LookHouse

Le mode `supabase` transforme la PWA local-first en application multi-utilisateurs
sécurisée : **auth**, **RBAC par propriété de ligne (RLS deny-by-default)**,
**audit serveur**, **ingestion planifiée** (toutes les heures) et **notifications**.
Le frontend reste hébergeable sur GitHub Pages ; la clé `anon` du bundle est
inoffensive car **toute la sécurité est appliquée ici**, jamais par le client.

> ⚠️ **Secrets** : ne jamais committer un PAT Supabase (`sbp_…`) ni la clé
> `service_role`. La _push protection_ GitHub rejette le motif `sbp_…`. Les
> secrets vivent dans les **Edge Function secrets** et les **Secrets GitHub
> Actions**. Si un token a transité en clair quelque part, **révoquez-le**.

## 1. Création du projet

1. Créer un projet Supabase (région **eu-central-1 / Frankfurt** recommandée — RGPD).
2. Extensions activées automatiquement par les migrations : `pgcrypto`, `pg_trgm`,
   `cube`, `earthdistance`, `pg_cron`, `pg_net`.

## 2. Migrations (forward-only)

- **Manuel** :
  ```bash
  supabase link --project-ref <ref>
  supabase db push
  ```
- **CI** : le workflow `.github/workflows/supabase-migrations.yml` exécute
  `supabase db push` à chaque fusion sur `main` touchant `supabase/migrations/**`.
  Secrets requis : `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_ID`,
  `SUPABASE_DB_PASSWORD`.

Ordre : `0001_schema` → `0002_rls` → `0003_seed` (référentiel sources) →
`0004_scheduling` (pg_cron + pg_net) → `0005_notifications_dispatch`.

## 3. Storage

Créer un bucket **privé** `listing-media` (déjà déclaré dans `config.toml`). Les
politiques storage de `0002_rls.sql` s'activent automatiquement si le bucket existe
(propriété par `owner = auth.uid()`).

## 4. Auth

- Activer **Email + mot de passe**, confirmations email **on**, longueur mini 8.
- **MFA TOTP** recommandé (Pro) pour durcir l'accès.
- `site_url` = URL du site déployé ; ajouter l'URL Pages dans
  `additional_redirect_urls`.

## 5. Edge Functions

`ingest-run` réutilise le **cœur métier partagé** (`_shared/core`, généré depuis
`src/` par `npm run build:edge-core`) : la MÊME normalisation (`parseListings`) et
le MÊME plan (`planIngestion`) que le front. Régénérer avant tout déploiement si
`src/domain` ou `src/ingestion/{pipeline,schema,fieldMap}` a changé.

```bash
npm run build:edge-core          # régénère supabase/functions/_shared/core (NE PAS éditer la copie)
supabase functions deploy ingest-run --no-verify-jwt
supabase functions deploy notify --no-verify-jwt
```

Secrets (jamais dans le code) :

```bash
supabase secrets set INGEST_TOKEN="<jeton aléatoire long>"
# SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY sont injectés automatiquement.
```

### Connecteurs `authorized_api` (collecte automatique responsable)

`ingest-run` ne collecte QUE via des connecteurs déclarés par l'utilisateur
(`source_connectors`, `mode = 'authorized_api'`). Pour chaque recherche due, il
appelle l'URL configurée, normalise via le cœur partagé, puis applique le plan
(insert/maj + versions + historique de prix par trigger + similarité +
notifications). **Aucun portail n'est scrapé.** Forme de `config` (jsonb) :

| Clé                         | Rôle                                                       |
| --------------------------- | ---------------------------------------------------------- |
| `url`                       | **https** obligatoire — l'endpoint d'API autorisé          |
| `method`                    | `GET` par défaut                                           |
| `headers`                   | en-têtes additionnels (optionnel)                          |
| `listPath`                  | chemin pointé vers le tableau (`data.items`) ; déf. racine |
| `map`                       | mappage `champ → chemin` (ex. `{"externalId":"id"}`)       |
| `authHeader` / `authScheme` | pour le secret (déf. `Authorization` / `Bearer`)           |

Un éventuel jeton d'API est un **secret d'Edge Function** référencé par
`source_connectors.secret_ref` (jamais sa valeur en base).

## 6. Planification horaire (pg_cron → pg_net → ingest-run)

Stocker l'URL de la fonction et le jeton dans le **Vault**, puis la migration
`0004` programme l'appel horaire (`lh_trigger_ingestion`). Si les secrets sont
absents, la fonction de déclenchement est un **no-op** inoffensif.

```sql
-- À exécuter une fois (Dashboard → SQL), avec vos valeurs :
select vault.create_secret('https://<ref>.functions.supabase.co/ingest-run', 'lh_ingest_url');
select vault.create_secret('<INGEST_TOKEN>', 'lh_ingest_token');
-- (Le cron 'lh-hourly-ingestion' est créé par 0004_scheduling.sql.)
```

## 7. Modèle de sécurité (RLS)

| Table(s)                                | Lecture        | Écriture                            |
| --------------------------------------- | -------------- | ----------------------------------- |
| `sources` (référentiel global)          | authentifié    | service_role                        |
| Toutes les tables `…` portant `user_id` | `= auth.uid()` | `= auth.uid()`                      |
| `audit_logs`                            | propriétaire   | triggers serveur (SECURITY DEFINER) |

- **deny-by-default** : `enable` + `force row level security` sur toutes les tables.
- Les jobs planifiés écrivent avec `service_role` (hors RLS) **en renseignant
  explicitement `user_id`**.
- Les Edge Functions appelées par un utilisateur transmettent son JWT → la RLS
  s'applique. Celles planifiées sont gated par `INGEST_TOKEN`.

## 8. Activer le mode Supabase au build (GitHub Pages)

Vite lit les variables **au build**. Copier `.env.production.example` →
`.env.production` (versionné, valeurs **publiques** uniquement) :

```
VITE_BACKEND=supabase
VITE_SUPABASE_URL=https://<ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<clé anon publique>
VITE_VAPID_PUBLIC_KEY=<clé publique VAPID>
```

## 9. Ce qui reste à durcir (honnêteté)

- **Collecte par source** : seuls les connecteurs `authorized_api` collectent
  automatiquement. Aucun scraping de portail n'est fourni (choix responsable).
- **Web Push** : la signature VAPID + le chiffrement aes128gcm restent à
  implémenter dans `notify` (le webhook est fonctionnel).
- **E-mail** : brancher un fournisseur SMTP/API.
- **Cœur métier partagé** : ✅ fait — `_shared/core` est généré depuis `src/`
  (`npm run build:edge-core`) et `ingest-run` rejoue exactement la même logique de
  normalisation/scoring/dédup que le front (validé en live).
- **Médias serveur** : `ingest-run` n'enregistre pas encore les `listing_media`
  (URL/phash) ni ne recharge les phash existants → la similarité **image** n'est
  pas encore exploitée côté serveur (le reste de la similarité l'est).
