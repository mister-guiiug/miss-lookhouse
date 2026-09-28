# 🏠🔭 Miss LookHouse

PWA de **veille immobilière** : surveillez plusieurs sources d'annonces sur une
zone géographique, **historisez** les annonces, détectez les **doublons /
annonces recyclées**, suivez l'**évolution des prix**, **qualifiez** manuellement
et recevez des **notifications** pertinentes.

> **D'où viennent les annonces.** Trois voies :
>
> - l'**import manuel** (URL ou JSON collé) ;
> - la **capture initiée par l'utilisateur** : un bookmarklet copie les champs
>   de la page qu'il consulte ;
> - une **collecte serveur automatique** : les Edge Functions `ingest-run` et
>   `ingest-now` lisent les plans de site et les pages d'annonces publiques de
>   **14 sites d'agences et de réseaux immobiliers** (liste dans
>   `scripts/seed-agences.mjs`), et en extraient prix, surface, pièces et ville
>   (balises de la page, JSON-LD, API REST publique de WordPress pour l'un
>   d'eux).
>
> Le collecteur s'annonce (`miss-lookhouse-collector/1.0`), lit le HTML tel qu'il
> est servi, espace ses requêtes d'au moins 300 ms et s'arrête à 50 ou 60
> annonces par site et par passage. **Il ne lit pas le `robots.txt` des sites**,
> et le dépôt ne consigne aucune autorisation de leur part. leboncoin, SeLoger,
> Bien'ici et PAP ne sont pas collectés.

Membre de la famille de PWA **mister-guiiug** (React 19 + Vite 8 + Tailwind v4 +
Zustand + Zod, config partagée `@mister-guiiug/dev-pwa-config`).

---

## 📡 Statut

- **Front local-first** : démo 100 % navigateur, **sans backend**.
- **Backend Supabase** : **provisionné, validé en live** (isolation RLS par
  compte _prouvée_ : login → écriture → lecture isolée, anon ne voit rien) et le
  **site déployé tourne en mode Supabase** (authentification requise).
- **MVP + durcissement livrés** : sécurité serveur (anti-SSRF, timeouts,
  comparaison à temps constant), fiabilité (pagination du pull, écritures par
  lots, garde anti-dérive du cœur Edge), **cœur métier partagé front↔Edge**,
  **Web Push** (VAPID), **connecteurs de collecte** (moteur générique
  `authorized_api` + dry-run, et connecteurs de site : plans de site, HTML,
  JSON-LD, WordPress REST), **prix de référence DVF**, **partage de recherches** (lecture),
  **statut de livraison** des notifications, **canal e-mail** (opt-in),
  **similarité par embeddings** (option) et **politique d'inscription** (hook,
  sur invitation par défaut). Reste : **éprouver le push réel** (navigateur
  installé), et les **gestes d'exploitation** qui activent ces trois derniers
  — voir _Ce qui reste_.

## ✨ Ce qui est déjà là

- **Cœur métier pur & testé** (`src/domain`) : similarité explicable (texte,
  prix, surface, pièces, géo, **hash perceptuel d'images** (comparaison
  d'empreintes fournies : rien ne les calcule depuis les photos), contact), scoring de
  pertinence/fraîcheur, détection de **baisse de prix** et de **republication**,
  historisation (deltas + série de prix), **clustering** de doublons.
- **Pipeline d'ingestion pur & testé** (`src/ingestion`) : connecteurs (import
  manuel, URL de recherche, **capture navigateur** via bookmarklet, API
  autorisée, et connecteurs de site dans `src/ingestion/sites` : plans de site,
  HTML, JSON-LD, WordPress REST), validation Zod, plan d'actions idempotent.
- **PWA fonctionnelle en mode local** : import réel → dédup → scoring →
  notifications, exécutés par le moteur dans le navigateur.
- **Écrans complets** : tableau de bord, recherches (création / **édition** /
  activation), annonces + **détail** + **galerie photos** (lightbox ; en mode
  Supabase, les annonces arrivent sans photos), **doublons**,
  **carte** interactive (Leaflet/OSM), notifications (**appui long** = repasser en
  non-lu), **vérification métier** (checklist / confiance / anomalies), **journal
  des traitements**, import, réglages + menu d'en-tête (version / forcer la MAJ).
- **Backend Supabase opérationnel** : schéma normalisé + **RLS deny-by-default** +
  audit + planification (`supabase/migrations` `0001→0019`), Edge Functions
  `ingest-run` (réveillée toutes les heures par pg_cron ; collecte chaque
  recherche due, `hourly` après 55 min, `daily` après 23 h ; **cœur partagé**),
  `ingest-now` (collecte immédiate du catalogue partagé, lancée par tout
  utilisateur connecté depuis « Traitements », au plus une fois par 10 minutes),
  `connectors-admin` (gestion collaborative : tout utilisateur connecté active ou
  coupe les connecteurs du catalogue partagé et fixe leurs départements ; sans
  département, le périmètre est national), `embed` (embeddings
  `gte-small`, appelée en fin d'ingestion), `notify` (dispatch-once : webhook +
  **Web Push** VAPID + **e-mail** + **statut de livraison**), `dvf` (prix au
  m²), `connector-test` (dry-run) et `notify-test` (notification de test).
- **Similarité par embeddings** (option, désactivée par défaut) : pgvector,
  visibilité calquée sur celle des annonces, RPC des voisins sous la RLS ; le
  cosinus devient un facteur de plus de l'heuristique (poids 0,2), et la fiche
  d'une annonce dit d'où vient chaque rapprochement.
- **Politique d'inscription** : `open` / `invite` (défaut) et liste d'adresses,
  tranchées par un hook « Before User Created » — **inactif tant que
  l'exploitant ne l'a pas branché**.
- **Cœur métier partagé front↔Edge** : `supabase/functions/_shared/core` est
  **généré** depuis `src/` (`npm run build:edge-core`) → la même normalisation et
  le même plan d'ingestion côté serveur, avec **garde anti-dérive** en CI.
- **Connecteurs `authorized_api`** (mode Supabase) : CRUD + **dry-run** (« Tester »)
  qui récupère/mappe/normalise un échantillon **sans rien écrire**, derrière une
  garde **anti-SSRF**. **Partage de recherches** en lecture (e-mail, RLS additive).
- **Auth Supabase in-app** (login / inscription, `AuthGate`) + **adaptateur de
  dépôt offline-first** : file de synchro **persistante** (rejeu / dead-letter),
  pull → hydrate / push, bascule `local` ↔ `supabase` par variable d'env.
- **Géocodage** Base Adresse Nationale (officiel, gratuit, sans clé).
- **240 tests** unitaires (Vitest : cœur métier, mélange des embeddings,
  ingestion, composition des e-mails, mappers, géocodeur, file de synchro,
  écrans) et **8 fichiers pgTAP** joués en CI (RLS, `security definer`,
  suppression de compte, droits d'ingestion et de la vue des recherches dues,
  embeddings, opt-in e-mail, hook d'inscription).

## 🚧 Ce qui reste (honnêteté)

- **Éprouver le Web Push en réel** : le code (VAPID + chiffrement, abonnement,
  Service Worker, **statut de livraison**) est livré mais **non validé de bout en
  bout** — exige un navigateur **installé** (iOS ≥ 16.4 en PWA installée). Un
  bouton **« Notification test »** (réglages) déclenche un envoi immédiat à soi.
- **E-mail** dans `notify` : **câblé** (opt-in dans les Réglages, adresse du
  compte confirmée, API compatible Resend), mais **inerte tant que ses secrets
  ne sont pas posés** (le canal est alors `skipped`). Et **`notify` n'est
  appelée par aucun cron** : aujourd'hui, seule la « Notification test » la
  déclenche — e-mail, webhook et push compris. La planifier est une décision à
  part, qui demande d'abord d'estampiller l'arriéré de notifications jamais
  dispatchées (voir `supabase/README.md` §5).
- **Politique d'inscription** : livrée (`invite` par défaut, liste d'adresses),
  mais **sans effet tant que le hook n'est pas branché** — c'est ce geste qui
  choisit la politique. L'**ouverture publique** demande aussi un **SMTP
  personnalisé** : le service d'e-mail intégré de Supabase n'écrit qu'aux
  membres de l'équipe du projet, 2 messages par heure — le lien de connexion
  n'atteindrait personne d'autre.
- **Embeddings** : livrés **en option**, avec leurs limites. `gte-small` est
  entraîné surtout sur l'anglais : bon pour les doublons et les republications
  (textes quasi identiques), **pas** pour la similarité de sens fine entre
  annonces françaises. Le poids (0,2) et le plancher de cosinus (0,85) sont
  posés a priori, non calibrés sur un corpus. L'index HNSW est approximatif, et
  la RLS filtre ses candidats après lui. Le signal s'affiche sur la **fiche**
  d'une annonce ; l'écran « Doublons » reste celui de l'heuristique.
- **Connecteurs par source réelle** : 14 sites d'agences et de réseaux sont
  collectés depuis fin juin 2026 par des connecteurs de site (voir « D'où
  viennent les annonces »). Ils sont enregistrés en mode `authorized_api` alors
  qu'ils lisent des pages publiques. **Reste à faire** : lire le `robots.txt` de
  chaque site et consigner son autorisation ou ses conditions d'utilisation.
  leboncoin, SeLoger, Bien'ici et PAP restent non branchés, faute d'API ou de
  flux autorisé (voir hypothèses).
- **Dette technique** (non bloquante) : typage Supabase complet
  (`database.types.ts`), tests des helpers Edge (DVF).

### Les gestes qui restent à l'exploitant, dans l'ordre

Le dépôt ne déploie aucune Edge Function et ne pose aucun secret. Les
migrations `0016`→`0019`, elles, partent en production à la fusion (CI).

1. **Déployer `embed` et `notify`** (après la fusion et le passage des
   migrations) : `supabase functions deploy embed --no-verify-jwt` et
   `supabase functions deploy notify --no-verify-jwt` ; redéployer aussi
   `ingest-run` (qui appelle désormais `embed`). Rappeler `embed` à la main
   pour résorber l'arriéré — `supabase/README.md` §5.
2. **Poser les secrets e-mail** de `notify` : `EMAIL_API_KEY`, `EMAIL_FROM`
   (et, au besoin, `EMAIL_API_URL`, `APP_URL`), par
   `supabase secrets set --env-file` depuis un fichier hors du dépôt —
   `supabase/README.md` §5.
3. **Activer le hook et choisir le mode** : Authentication › Hooks › « Before
   User Created » › `public.lh_before_user_created` ; `invite` est déjà en place
   (sinon `update public.app_settings set signup_mode = 'open'`) ; remplir
   `public.signup_allowlist` — `supabase/README.md` §4.1.
4. **Configurer le SMTP** personnalisé : Authentication › Emails › SMTP
   Settings, puis relever la limite dans Rate Limits — `supabase/README.md`
   §4.2.

## ⚠️ Hypothèses & incertitudes (rien d'inventé)

- À la connaissance de ce projet, **leboncoin / SeLoger / Bien'ici / PAP
  n'exposent pas d'API publique tierce** pour la veille, et leurs CGU encadrent
  l'usage automatisé. ⇒ ces quatre portails ne sont pas collectés. En **mode
  local**, les annonces viennent de l'**import/capture utilisateur**. En **mode
  Supabase** (celui du site déployé), elles viennent du serveur : connecteurs du
  compte et catalogue partagé « Agences 63 ». Un import ou une capture y reste
  dans le navigateur, n'est pas envoyé au serveur, et disparaît au chargement
  suivant, quand le pull remplace le miroir local.
- **Géocodage** : Base Adresse Nationale `api-adresse.data.gouv.fr` (officiel,
  gratuit, sans clé) — vérifié comme service public.
- **Web Push** sur iOS nécessite une PWA **installée** (iOS ≥ 16.4) — à tester.
- Le code ne lit ni `robots.txt` ni CGU. Les connecteurs de site sont enregistrés
  en mode `authorized_api`, pas `server_fetch`, et le drapeau
  `sources.server_fetch_allowed` (posé à `true` pour les 14 sites par
  `seed-agences.mjs`) n'est lu par aucune fonction : il ne bloque rien.

---

## 🏗️ Architecture (vue d'ensemble)

```
┌──────────────────────── PWA (GitHub Pages / installable) ────────────────────────┐
│  React 19 + Vite 8 + Tailwind v4 + Zustand + react-router (HashRouter)            │
│  src/domain   ── cœur PUR (similarité, scoring, historisation, clustering)        │
│  src/ingestion── connecteurs + pipeline (plan idempotent)                         │
│  Mode LOCAL : tout en navigateur (localStorage)   │  Mode SUPABASE : ↓            │
└────────────────────────────────────────────────────┼──────────────────────────────┘
                                                      │ supabase-js (clé anon, RLS)
┌─────────────────────────── Supabase ────────────────▼──────────────────────────┐
│  PostgreSQL : schéma normalisé + RLS deny-by-default + audit (triggers)         │
│  pg_cron (horaire) → pg_net → Edge Function `ingest-run` (service_role)          │
│  « Actualiser le catalogue » → Edge `ingest-now` · Edge `connectors-admin`       │
│  Edge `notify` (webhook + Web Push VAPID + e-mail + statut) · `dvf` · `*-test`   │
│  Edge `embed` (gte-small, en fin d'ingestion) → pgvector, index HNSW, RLS        │
│  Hook Auth « Before User Created » → inscription open / invite (si branché)      │
│  Storage privé `listing-media` (prévu, inutilisé par le code)                    │
└──────────────────────────────────────────────────────────────────────────────────┘
```

## 🚀 Démarrer en local

```bash
# 1) Auth GitHub Packages (config famille @mister-guiiug)
export NODE_AUTH_TOKEN="$(gh auth token)"   # nécessite le scope read:packages

# 2) Installer + lancer (port 5173, celui de Vite par défaut)
npm install
npm run dev
```

Ouvrez http://localhost:5173/ : l'app démarre en **mode démo local** avec un jeu
de données fictif. Essayez **Importer** (charger l'exemple) pour voir le moteur
dédupliquer/scorer/notifier en direct.

### Scripts

| Script                  | Rôle                                                                     |
| ----------------------- | ------------------------------------------------------------------------ |
| `npm run dev`           | Serveur de dev (port 5173)                                               |
| `npm test`              | Tests unitaires (Vitest)                                                 |
| `npm run type-check`    | Typage strict (TS `tsc -b`)                                              |
| `npm run lint`          | ESLint                                                                   |
| `npm run format`        | Prettier (la CI vérifie `format:check`)                                  |
| `npm run build`         | Build de production                                                      |
| `npm run supabase:push` | Applique les migrations (CLI Supabase)                                   |
| `npm run seed:agences`  | Amorce les 14 connecteurs de site et le catalogue partagé « Agences 63 » |

## 🔐 Mode Supabase

Le backend est **provisionné, validé en live** (isolation RLS par compte prouvée)
et le **site déployé tourne en mode Supabase** (authentification requise). Détails
techniques (migrations, RLS, planification, Edge Functions, secrets) :
**[`supabase/README.md`](supabase/README.md)**.

- **Dev local branché Supabase** : copier `.env.example` → `.env.local` et
  renseigner `VITE_BACKEND=supabase` + URL + **clé anon publiques**.
- **Build de production** : lit `.env.production` (versionné, **valeurs publiques
  uniquement** ; la RLS arbitre tous les accès) et reçoit du workflow `Deploy`
  deux variables du dépôt. `VITE_SENTRY_DSN` : les erreurs partent à Sentry
  (hébergement en Allemagne) dès le chargement, sans demande de consentement.
  `VITE_POSTHOG_KEY` : la mesure d'audience PostHog (nuage européen) n'est
  chargée qu'après accord dans le bandeau de consentement.

> Les secrets (`service_role`, `INGEST_TOKEN`, clé VAPID privée, clé d'API
> e-mail) ne vivent **jamais** dans le dépôt : ils sont dans les secrets
> Supabase / Edge Functions, et dans le Vault pour l'URL et le jeton du cron. Le
> mot de passe de la base et un jeton d'accès Supabase sont, eux, des secrets
> GitHub Actions (`SUPABASE_DB_PASSWORD`, `SUPABASE_ACCESS_TOKEN`), lus par le
> workflow `Supabase migrations`.

> ⚠️ **Les migrations partent en production à la fusion.** Le workflow
> `Supabase migrations` applique `supabase/migrations/**` au projet hébergé à
> chaque fusion sur `main` : ses secrets sont posés depuis le 14/09/2026, et il
> passe depuis (après dix échecs de juin au 13/09, dont l'historique est dans
> **[`CONFIG.md`](CONFIG.md)**). Une migration doit donc être additive,
> rejouable et couverte par `supabase/tests/` avant d'être fusionnée. Les Edge
> Functions, elles, ne sont déployées par aucun workflow.

## 🌐 Déploiement (GitHub Pages)

CI/CD délégués aux workflows réutilisables famille, en `@v6` (`pwa-ci.yml`,
`pwa-deploy.yml`, `pwa-lighthouse.yml`, `pwa-supabase-test.yml`,
`pwa-supabase-keepalive.yml`). `base` = `/miss-lookhouse/`, HashRouter. Le site atterrit sur
`https://mister-guiiug.github.io/miss-lookhouse/` (**mode Supabase** — écran de
connexion). Lancer `npx prettier --write .` avant tout commit (la CI vérifie
`prettier --check`).

---

## 🗺️ Backlog

### MVP — livré ✅

- [x] Cœur similarité / scoring / historisation testé
- [x] Pipeline d'ingestion (plan idempotent) testé
- [x] Recherches : création, **édition**, activation/désactivation, import manuel
- [x] Historique de prix + détection baisse/recyclage
- [x] Vue liste + détail + doublons + notifications + réglages
- [x] Tags / qualification manuelle
- [x] Schéma Supabase + RLS + planification + Edge Functions
- [x] **Auth Supabase in-app** (login/inscription) + bascule local ↔ supabase
- [x] **Adaptateur dépôt Supabase** branché sur le store (offline-first, file persistante)
- [x] **Backend provisionné, validé live (RLS isolée) et déployé** (Pages en mode Supabase)

### V2

- [x] Capture navigateur (bookmarklet) initiée par l'utilisateur
- [x] Vérification métier (checklist, niveau de confiance, anomalies)
- [x] Enrichissement géocodage (BAN)
- [x] Journal des traitements (runs / événements d'ingestion)
- [x] Connecteurs de site (plans de site, HTML, JSON-LD, WordPress REST) : 14
      sites d'agences et de réseaux, amorcés par `npm run seed:agences` ;
      connecteurs `authorized_api` JSON + **dry-run** ; leboncoin / SeLoger /
      Bien'ici / PAP non branchés
- [ ] Lecture du `robots.txt` et trace de l'autorisation de chaque site collecté
- [x] **Web Push (VAPID)** + **statut de livraison** (à éprouver navigateur
      installé) · **e-mail** : câblé (opt-in), secrets à poser
- [x] **Cœur métier partagé** front ↔ Edge Functions (`_shared/core`, généré)
- [x] **Prix de référence DVF** (Edge `dvf`, prix au m²)

### V3

- [x] Carte interactive (marqueurs + zones)
- [x] Dessin de **polygone** de zone sur la carte (`ZonePolygonEditor`)
- [x] Similarité par **embeddings** (pgvector, `gte-small`) en option, après
      l'heuristique — sur la fiche d'une annonce ; fonction `embed` à déployer
- [x] **Partage de recherches** (lecture) · multi-zones / rôles d'équipe : à venir
- [x] **Statut de livraison** des notifications (par canal, e-mail compris) ·
      dashboards : à venir
- [x] **Politique d'inscription** (`invite` par défaut, liste d'adresses, hook
      « Before User Created ») — livrée, **à activer** par l'exploitant
- [~] **SMTP custom** : documenté (`supabase/README.md` §4.2), **reste à
  configurer** au tableau de bord — préalable à l'ouverture publique

## 🧪 Tests

```bash
npm test
```

Couvrent : normalisation FR, similarité textuelle/géo/image, scoring, deltas de
prix, clustering, **mélange des embeddings** (poids, plancher, idempotence),
**plan d'ingestion** (nouveau vs maj, baisse de prix, recyclage, exclusion hors
zone), **composition et statuts de l'e-mail** de `notify`, **mappers** Supabase
(dont **statut de livraison**), **géocodeur** BAN, **file de synchro**,
**pagination du dépôt** et les écrans (réglages, refus d'inscription sur
invitation, suppression de compte…).

Les tests **pgTAP** (`supabase/tests/`) ne tournent qu'en CI (workflow
`Supabase tests`) : le poste n'a pas de Docker.

## 📁 Structure

```
src/
  domain/      cœur PUR (similarité, embeddings, scoring, géo, images, historisation) + tests
  ingestion/   connecteurs (dont sites/ : plans de site, HTML, JSON-LD, WordPress)
               + schema (zod) + pipeline + bookmarklet + tests
  notify/      partie PURE du dispatch (e-mail, statuts par canal), copiée côté Edge + tests
  push/        abonnement Web Push
  store/       Zustand (mode local) + persistance
  demo/        jeu de données de la démo locale
  backend/     sélection backend, client, mappers, dépôt, file de synchro
  auth/        adaptateur d'auth, AuthGate, inscription (l'AuthProvider vient du socle)
  components/  layout, nav, menu d'en-tête, UI (badges, sparkline)
  features/    écrans (dashboard, searches, listings, similar, map,
               notifications, processing, settings, import, connectors, auth)
  lib/         formatage, géocodeur (BAN), DVF, statistiques des passages, appui long
scripts/       build-edge-core, generate-maskable, seed-agences
supabase/
  migrations/  0001_schema … 0019_due_searches_privileges (RLS, planif, partage,
               livraison, embeddings, e-mail, inscription, droits de la vue des
               recherches dues)
  functions/   ingest-run · ingest-now · connectors-admin · embed · notify · dvf ·
               connector-test · notify-test · _shared (core généré)
  tests/       pgTAP (joués en CI)
```

## 📝 Licence

MIT, © 2026 GuiiuG (famille mister-guiiug). Soutien : Buy Me a Coffee (`mister.guiiug`).
