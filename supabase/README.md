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
   `cube`, `earthdistance`, `pg_cron`, `pg_net`, et `vector` (pgvector, dans le
   schéma `extensions`, depuis `0016`).

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

  > ⚠️ **Les secrets sont posés depuis le 14/09/2026, et c'est la production
  > qui reçoit chaque migration fusionnée.** Le workflow a échoué à ses huit
  > exécutions de juin au 13/09 faute de secrets ; il passe depuis (exécutions
  > réussies du 14/09 et du 19/09). Une migration doit donc être additive,
  > rejouable et couverte par `supabase/tests/` AVANT la fusion. L'historique
  > de la panne est dans [`CONFIG.md`](../CONFIG.md).

Ordre : `0001_schema` → `0002_rls` → `0003_seed` (référentiel sources) →
`0004_scheduling` (pg_cron + pg_net) → `0005_notifications_dispatch` →
`0006_search_sharing` → `0007_list_shares` → `0008_share_neutral` →
`0009_notification_delivery` (statut de livraison + garde de colonne) →
`0010_public_catalog` → `0011_keep_alive` (table du ping anti-pause) →
`0012_rls_no_force` (retrait de `force row level security`, cf. §7) →
`0013_delete_my_account` (RGPD art. 17 : l'utilisateur efface son compte) →
`0014_keep_alive_privileges` (privilèges de table de `keep_alive`, seconde
barrière indépendante de la RLS) → `0015_ingestion_privileges` (seul pg_cron
déclenche l'ingestion : `anon` pouvait l'appeler par PostgREST) →
`0016_listing_embeddings` (pgvector : un embedding par annonce, visible
exactement là où l'annonce l'est, index HNSW cosinus, RPC des voisins) →
`0017_notification_email` (le canal e-mail de `notify` : documentation de la
base et contrat de l'opt-in) → `0018_signup_policy` (politique d'inscription
`open` / `invite` et le hook « Before User Created », **inactif tant qu'il n'est
pas branché**, cf. §4) → `0019_due_searches_privileges` (la vue des recherches
dues, lisible par `anon` et sous BYPASSRLS, passe en `security_invoker` et
n'est plus lisible que par `service_role`).

> `0011_keep_alive` et `0014_keep_alive_privileges` sont **appliquées** : le
> dépôt a reçu ses secrets le 14/09/2026, et le ping anti-pause vise de nouveau
> `keep_alive` depuis le 15/09 — voir le commentaire de
> [`.github/workflows/supabase-keepalive.yml`](../.github/workflows/supabase-keepalive.yml)
> (PR #99). L'avertissement « `0011` non appliquée » du 13/09 est levé.

## 3. Storage

Créer un bucket **privé** `listing-media` (déjà déclaré dans `config.toml`). Les
politiques storage de `0002_rls.sql` s'activent automatiquement si le bucket existe
(propriété par `owner = auth.uid()`).

## 4. Auth

- Activer **Email + mot de passe**, confirmations email **on**, longueur mini 8.
- **MFA TOTP** recommandé (Pro) pour durcir l'accès.
- `site_url` = URL du site déployé ; ajouter l'URL Pages dans
  `additional_redirect_urls`.

### 4.1 Politique d'inscription — hook « Before User Created » (`0018`)

`0018_signup_policy` pose trois choses et **n'en active aucune** :

- `public.app_settings` : une seule ligne, `signup_mode` = `open` ou `invite`
  (**défaut `invite`**) ;
- `public.signup_allowlist` : les adresses invitées (comparaison insensible à
  la casse et aux espaces de bord) ;
- `public.lh_before_user_created(event jsonb)` : la fonction que Supabase Auth
  appelle avant de créer un compte. `open` → `{}` (on laisse créer) ; `invite`
  → `{}` si l'adresse est sur la liste, sinon
  `{"error": {"http_code": 403, "message": "L'inscription est sur invitation."}}`.

**Tant que le hook n'est pas branché, rien ne change** : l'inscription reste
libre. Le brancher, c'est choisir la politique :

1. Tableau de bord › **Authentication › Hooks** › _Add hook_ › **Before User
   Created** › type **Postgres** › schéma `public`, fonction
   `lh_before_user_created` › activer. (Les droits dont Supabase Auth a besoin
   sont déjà posés par la migration : `EXECUTE` à `supabase_auth_admin` seul,
   `USAGE` sur `public`.) Équivalent local, dans `config.toml` :

   ```toml
   [auth.hook.before_user_created]
   enabled = true
   uri = "pg-functions://postgres/public/lh_before_user_created"
   ```

2. Choisir le mode (SQL Editor) — `invite` est déjà en place :

   ```sql
   update public.app_settings set signup_mode = 'open';    -- ou 'invite'
   ```

3. Tenir la liste, en SQL ou dans le **Table Editor** (il n'y a pas de rôle
   d'administrateur dans l'app, donc pas d'écran pour ça) :

   ```sql
   insert into public.signup_allowlist (email, note)
   values ('prenom.nom@exemple.fr', 'invitée le 25/09/2026')
   on conflict do nothing;

   delete from public.signup_allowlist
   where lower(btrim(email)) = lower('prenom.nom@exemple.fr');

   select email, note, created_at
   from public.signup_allowlist
   order by created_at desc;
   ```

**Ce que le hook arrête, et ce qu'il laisse passer.** Il part avant TOUTE
création de compte : inscription par mot de passe, **lien magique vers une
adresse inconnue** (le chemin principal de l'écran de connexion), invitation
depuis le tableau de bord (« Invite user » : ajouter l'adresse à la liste
d'abord), OAuth, SSO, connexion anonyme. Il ne touche **pas** les comptes
existants (il ne part qu'à la création), ni la création directe par
l'administrateur (« Add user » › _Create new user_, ou `auth.admin.createUser`) :
c'est la voie des comptes manuels. Côté app, le refus s'affiche en clair
(« L'inscription est sur invitation… ») au lieu d'une erreur technique.

**Le contrat, vérifié le 25/09/2026** dans la documentation Supabase
([Before User Created hook](https://supabase.com/docs/guides/auth/auth-hooks/before-user-created-hook),
[Auth Hooks](https://supabase.com/docs/guides/auth/auth-hooks)) et dans le code
de Supabase Auth (`internal/hooks/hookspgfunc`, `hookserrors`, et les appels
de `signup.go`, `invite.go`, `external.go`, `anonymous.go` — pas `admin.go`) :
entrée `{ "metadata": {…}, "user": { "email": …, "app_metadata": {…} } }`,
exécution sous `supabase_auth_admin` avec un délai de 2 s, `{}` ou `{"error":
{"http_code", "message"}}` en sortie ; le client reçoit un HTTP 403 portant le
message, sans code d'erreur stable — d'où la reconnaissance par le message
(`src/auth/inscription.ts`).

**RGPD.** La liste contient des adresses : celles que l'exploitant a
invitées. `delete_my_account()` ne la vide pas (ce n'est pas une donnée du
compte, et l'effacer rouvrirait la porte) : retirer une adresse reste un
geste de l'exploitant.

Éprouvé par `supabase/tests/signup_policy.test.sql` (appel direct avec les
évènements types, droits, tables fermées).

### 4.2 SMTP personnalisé — avant toute ouverture publique

**Pourquoi.** Le service d'e-mail intégré de Supabase est un service de
démonstration : il **n'écrit qu'aux adresses des membres de l'équipe du
projet** et plafonne à **2 messages par heure**
([Custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp)). Or tout, ici,
passe par l'e-mail d'Auth : le **lien de connexion** (le chemin principal de
l'écran de connexion), la confirmation d'inscription, la récupération de mot
de passe. Sans SMTP personnalisé, un visiteur extérieur à l'équipe ne reçoit
rien — quelle que soit la politique d'inscription.

**Où.** Tableau de bord › **Authentication › Emails › SMTP Settings** ›
_Enable custom SMTP_, puis renseigner, depuis le compte du fournisseur (Resend,
Postmark, Amazon SES, Brevo… — n'importe quel SMTP) :

| Champ                     | Ce qu'on y met                                                       |
| ------------------------- | -------------------------------------------------------------------- |
| Sender email              | une adresse d'un domaine **vérifié chez le fournisseur** (SPF, DKIM) |
| Sender name               | `Miss LookHouse`                                                     |
| Host / Port               | ceux du fournisseur (587 en STARTTLS, 465 en TLS)                    |
| Username / Password       | l'identifiant SMTP du fournisseur — un secret, jamais dans le dépôt  |
| Minimum interval per user | l'intervalle minimal entre deux e-mails à une même adresse           |

Une fois activé, Supabase commence à **30 e-mails par heure** : relever la
limite dans **Authentication › Rate Limits** selon l'usage. Les modèles de
message (Authentication › Emails › Templates) sont à relire en français.

**En local**, l'équivalent vit dans `config.toml` (commenté dans le fichier ;
les valeurs viennent de l'environnement, jamais du dépôt) :

```toml
# [auth.email.smtp]
# enabled = true
# host = "smtp.votre-fournisseur.example"
# port = 587
# user = "env(SMTP_USER)"
# pass = "env(SMTP_PASS)"
# admin_email = "no-reply@votre-domaine.example"
# sender_name = "Miss LookHouse"
#
# [auth.rate_limit]
# email_sent = 30
```

`config.toml` ne configure que la pile locale (`supabase start`) : le projet
hébergé se règle au tableau de bord.

## 5. Edge Functions

`ingest-run` réutilise le **cœur métier partagé** (`_shared/core`, généré depuis
`src/` par `npm run build:edge-core`) : la MÊME normalisation (`parseListings`) et
le MÊME plan (`planIngestion`) que le front. `notify` y prend la partie pure de
son canal e-mail (`src/notify/`), `embed` le nom du modèle et la validation des
vecteurs (`src/domain/embedding.ts`). Régénérer avant tout déploiement si
`src/domain`, `src/notify` ou `src/ingestion/{pipeline,schema,fieldMap,sites}`
a changé — la CI (`edge-core-sync`) refuse une copie en retard.

**Aucun workflow ne déploie les Edge Functions** : c'est un geste manuel, après
la fusion (et après que la CI a appliqué les migrations dont elles dépendent).

```bash
npm run build:edge-core          # régénère supabase/functions/_shared/core (NE PAS éditer la copie)
# Gated par INGEST_TOKEN (cron / serveur) → JWT désactivé :
supabase functions deploy ingest-run --no-verify-jwt
supabase functions deploy embed      --no-verify-jwt
supabase functions deploy notify     --no-verify-jwt
supabase functions deploy dvf        --no-verify-jwt
# Appelées par l'utilisateur (JWT requis) → verify_jwt PAR DÉFAUT (ne pas désactiver) :
supabase functions deploy connector-test
supabase functions deploy notify-test
```

> `notify-test` crée une notification de test pour l'appelant (résolu via son JWT)
> puis appelle `notify` avec `INGEST_TOKEN` pour la dispatcher immédiatement
> (webhook + Web Push + e-mail) et renseigner son **statut de livraison**
> (`delivery`).

Secrets (jamais dans le code, jamais dans le dépôt) :

```bash
supabase secrets set INGEST_TOKEN="<jeton aléatoire long>"
# SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY sont injectés automatiquement.
```

### `embed` — les embeddings des annonces (`0016`)

`embed` calcule, par lots, le vecteur (384 dimensions) des annonces sans
embedding ou dont le texte a changé (`lh_embedding_backlog`, empreinte md5 du
texte source), avec `gte-small`, le modèle **intégré au runtime Edge** : aucune
clé, aucun secret, aucun appel sortant. `ingest-run` l'appelle en fin de
passage (réponse `embed` dans son JSON) ; un appel dure au plus ~25 s, ce qu'il
n'a pas fait, le passage suivant le fera. Pour résorber d'un coup l'arriéré du
premier déploiement, la rappeler à la main jusqu'à `"done": true` :

```bash
curl -s -X POST "https://<ref>.supabase.co/functions/v1/embed" \
  -H "Authorization: Bearer $INGEST_TOKEN"
```

`gte-small` est entraîné **surtout sur l'anglais** et ne lit que 512 jetons :
il suffit pour repérer un doublon ou une republication (textes presque mot
pour mot), il ne suffit **pas** pour une similarité de sens fine entre deux
annonces françaises reformulées. Côté app, le signal est donc **en option**
(Réglages › « Similarité par embeddings », désactivé par défaut) et vient
**après** l'heuristique : un facteur de poids 0,2 face aux autres facteurs
réunis (`src/domain/embedding.ts`), affiché avec son origine sur la fiche
d'une annonce.

### Canal e-mail de `notify` (`0017`)

Opt-in par utilisateur (Réglages › Notifications › « E-mail »,
`notification_preferences.email_enabled`, `false` par défaut) ; l'adresse est
celle du compte, **confirmée**, lue dans `auth.users` par `notify`. Texte brut
et HTML simple, le lien vers l'annonce, rien d'autre. Envoi par une API HTTP
compatible [Resend](https://resend.com/docs/api-reference/emails/send-email)
(`POST …/emails`, `Authorization: Bearer`), avec une clé d'idempotence par
notification. Trois secrets d'Edge Function, posés par l'exploitant — **sans
eux, le canal est `skipped`, jamais `failed`** :

| Secret          | Rôle                                                                |
| --------------- | ------------------------------------------------------------------- |
| `EMAIL_API_KEY` | clé d'API du fournisseur                                            |
| `EMAIL_FROM`    | expéditeur, d'un domaine vérifié chez lui : `Nom <adresse@domaine>` |
| `EMAIL_API_URL` | facultatif : un autre fournisseur compatible (défaut : Resend)      |
| `APP_URL`       | facultatif, public : la base des liens (défaut : le site sur Pages) |

Les poser depuis un fichier **hors du dépôt**, pour que les valeurs ne passent
ni par l'historique du shell ni par git :

```bash
supabase secrets set --env-file /chemin/hors-du-depot/notify-email.env
# notify-email.env : EMAIL_API_KEY=…  EMAIL_FROM="Miss LookHouse <alertes@…>"
```

Statut par canal dans `notifications.delivery.channels.email` : `sent`,
`failed` (fournisseur injoignable ou en erreur, secret mal formé), `skipped`
(pas d'opt-in, secrets absents, adresse non confirmée). Resend accepte
2 requêtes par seconde par défaut : `notify` espace ses envois.

> ⚠️ **`notify` n'est appelée par aucun cron** — ni par `ingest-run`. Aujourd'hui,
> seule la « Notification test » des Réglages la déclenche (`notify-test`) :
> e-mail, webhook et push ne partent donc que pour elle. Planifier `notify`
> (un cron comme `0004`) est une décision à part, et à préparer : sa première
> exécution dispatcherait TOUTES les notifications jamais envoyées (jusqu'à
> 200 par appel) depuis juin — il faudrait d'abord estampiller cet arriéré
> (`update notifications set dispatched_at = now() where dispatched_at is null`).

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
absents, la fonction de déclenchement est un **no-op** inoffensif. Depuis
`0015`, seuls le cron (`postgres`) et `service_role` peuvent l'exécuter.

```sql
-- À exécuter une fois (Dashboard → SQL), avec vos valeurs :
select vault.create_secret('https://<ref>.functions.supabase.co/ingest-run', 'lh_ingest_url');
select vault.create_secret('<INGEST_TOKEN>', 'lh_ingest_token');
-- (Le cron 'lh-hourly-ingestion' est créé par 0004_scheduling.sql.)
```

## 7. Modèle de sécurité (RLS)

| Table(s)                                  | Lecture                                                           | Écriture                            |
| ----------------------------------------- | ----------------------------------------------------------------- | ----------------------------------- |
| `sources` (référentiel global)            | authentifié                                                       | service_role                        |
| Toutes les tables `…` portant `user_id`   | `= auth.uid()`                                                    | `= auth.uid()`                      |
| `audit_logs`                              | propriétaire                                                      | triggers serveur (SECURITY DEFINER) |
| `listing_embeddings` (0016)               | là où l'annonce l'est (politique DÉLÉGUÉE à la RLS de `listings`) | service_role (`embed`)              |
| `app_settings`, `signup_allowlist` (0018) | aucun client (lus par le hook, SECURITY DEFINER)                  | `postgres` (SQL, tableau de bord)   |

- **deny-by-default** : `enable row level security` sur toutes les tables, et
  aucune politique qui ne nomme pas `auth.uid()`, directement ou par
  délégation (`listing_embeddings` → `listings`, 0016) — hors référentiel
  `sources` et `keep_alive` (0011), en lecture seule.
- Les jobs planifiés écrivent avec `service_role` (hors RLS) **en renseignant
  explicitement `user_id`**.
- Les Edge Functions appelées par un utilisateur transmettent son JWT → la RLS
  s'applique. Celles planifiées sont gated par `INGEST_TOKEN`.

### `force row level security` est écarté, volontairement

0002 le posait sur vingt tables. `0012_rls_no_force.sql` le retire, et son
en-tête détaille pourquoi. En bref :

`force` ne change le sort que du **propriétaire** des tables (`postgres`). Or ce
propriétaire porte l'attribut `BYPASSRLS`, **mesuré à `true`** par
`supabase/tests/` — et `BYPASSRLS` l'emporte sur `force`. Il ne protégeait donc
rien. En revanche il faisait dépendre l'app entière d'un attribut de rôle qui ne
nous appartient pas : les triggers d'audit de 0002 écrivent dans `audit_logs`
(table **sans politique d'écriture**) à chaque écriture sur `saved_searches` et
`listing_status`. Si `postgres` perdait `BYPASSRLS`, ce n'est pas l'audit qui
tomberait, c'est la création de recherche.

Ce que `force` protégerait s'il opérait — une connexion directe sous le rôle
propriétaire — n'existe pas via l'API : PostgREST se connecte en `authenticator`
puis bascule en `anon`, `authenticated` ou `service_role`.

Même décision, même raisonnement que le projet voisin `mister-miss-koh`
(`docs/politiques-rls.md`).

### Les tests

`supabase/tests/*.test.sql` (pgTAP), exécutés par le workflow
**Supabase tests** — pas sur le poste, dont le démon Docker ne démarre pas.

```bash
supabase start && supabase test db   # là où Docker fonctionne
```

Ils vérifient que les quatre chemins `security definer` du dépôt (`lh_audit`,
les deux triggers d'audit, `lh_share_search`, `lh_list_shares`) écrivent et
lisent **réellement** en rôle `authenticated`, en comptant les lignes : une
lecture bloquée par la RLS ne lève pas d'erreur, elle rend zéro ligne.

Et, depuis `0016`–`0018` :

- `listing_embeddings.test.sql` — pour trois comptes (propriétaire, partage,
  catalogue public), les embeddings visibles sont EXACTEMENT ceux des annonces
  visibles ; la RPC des voisins ne rend que du visible, même quand un voisin
  invisible est plus proche, et ne se laisse pas sonder ; aucune écriture
  client ; le « reste à calculer » ne rend que le neuf et le changé ;
- `notification_email.test.sql` — l'opt-in e-mail vaut `false` par défaut,
  seul son propriétaire le pose, et le statut de livraison ne se forge pas ;
- `signup_policy.test.sql` — le hook appelé avec les évènements documentés
  (`open`, `invite`, casse, sans adresse, sans réglage), et sa porte :
  `supabase_auth_admin` seul.

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
- **Web Push** : ✅ livré dans `notify` (VAPID + chiffrement via `npm:web-push`,
  abonnement + Service Worker + **statut de livraison**). Reste à **éprouver de
  bout en bout** sur navigateur **installé** (bouton « Notification test »).
- **E-mail** : ✅ câblé dans `notify` (opt-in, API compatible Resend, §5).
  Reste à **poser les secrets** — et, pour qu'il parte hors de la notification
  de test, à **planifier `notify`**, qu'aucun cron n'appelle (§5).
- **Inscription** : ✅ politique `open` / `invite` et son hook (§4.1), **inactifs
  tant que l'exploitant n'a pas branché le hook**. L'ouverture publique demande
  aussi le **SMTP personnalisé** (§4.2).
- **Embeddings** : ✅ en option (§5). Limites connues : `gte-small` est surtout
  anglais ; le poids (0,2) et le plancher de cosinus (0,85) sont posés a priori,
  pas mesurés sur un corpus ; l'index HNSW est approximatif et la RLS filtre
  ses candidats après lui (voir l'en-tête de `0016`) ; l'écran « Doublons »
  reste celui de l'heuristique — le signal s'affiche sur la fiche d'une annonce.
- **Cœur métier partagé** : ✅ fait — `_shared/core` est généré depuis `src/`
  (`npm run build:edge-core`) et `ingest-run` rejoue exactement la même logique de
  normalisation/scoring/dédup que le front (validé en live).
- **Médias serveur** : `ingest-run` n'enregistre pas encore les `listing_media`
  (URL/phash) ni ne recharge les phash existants → la similarité **image** n'est
  pas encore exploitée côté serveur (le reste de la similarité l'est).
