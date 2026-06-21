# 🏠🔭 Miss LookHouse

PWA de **veille immobilière responsable** : surveillez plusieurs sources
d'annonces sur une zone géographique, **historisez** les annonces, détectez les
**doublons / annonces recyclées**, suivez l'**évolution des prix**, **qualifiez**
manuellement et recevez des **notifications** pertinentes.

> **Collecte responsable, par conception.** Miss LookHouse **n'aspire pas** les
> portails tiers. Elle privilégie les **API/flux autorisés**, l'**import
> manuel** (URL/JSON) et la **capture initiée par l'utilisateur**, derrière une
> couche d'abstraction de sources. Aucun contournement de protection, aucun
> scraping agressif. Les limites légales/techniques de chaque source sont
> documentées dans le référentiel `sources` (migration `0003`).

Membre de la famille de PWA **mister-guiiug** (React 19 + Vite 8 + Tailwind v4 +
Zustand + Zod, config partagée `@mister-guiiug/dev-wpa-config`).

---

## 📡 Statut

- **Front local-first** : démo 100 % navigateur, **sans backend**.
- **Backend Supabase** : **provisionné, validé en live** (isolation RLS par
  compte _prouvée_ : login → écriture → lecture isolée, anon ne voit rien) et le
  **site déployé tourne en mode Supabase** (authentification requise).
- **Tout le MVP est livré** ; il reste surtout du durcissement (push/e-mail,
  connecteurs API autorisés, cœur partagé front↔Edge). Voir _Backlog_.

## ✨ Ce qui est déjà là

- **Cœur métier pur & testé** (`src/domain`) : similarité explicable (texte,
  prix, surface, pièces, géo, **hash perceptuel d'images**, contact), scoring de
  pertinence/fraîcheur, détection de **baisse de prix** et de **republication**,
  historisation (deltas + série de prix), **clustering** de doublons.
- **Pipeline d'ingestion pur & testé** (`src/ingestion`) : connecteurs (import
  manuel, URL de recherche, **capture navigateur** via bookmarklet, stub API
  autorisée), validation Zod, plan d'actions idempotent.
- **PWA fonctionnelle en mode local** : import réel → dédup → scoring →
  notifications, exécutés par le moteur dans le navigateur.
- **Écrans complets** : tableau de bord, recherches (création / **édition** /
  activation), annonces + **détail** + **galerie photos** (lightbox), **doublons**,
  **carte** interactive (Leaflet/OSM), notifications (**appui long** = repasser en
  non-lu), **vérification métier** (checklist / confiance / anomalies), **journal
  des traitements**, import, réglages + menu d'en-tête (version / forcer la MAJ).
- **Backend Supabase opérationnel** : schéma normalisé + **RLS deny-by-default** +
  audit + planification (`supabase/migrations` `0001→0005`), Edge Functions
  `ingest-run` (cron horaire) et `notify` (dispatch-once).
- **Auth Supabase in-app** (login / inscription, `AuthGate`) + **adaptateur de
  dépôt offline-first** : file de synchro **persistante** (rejeu / dead-letter),
  pull → hydrate / push, bascule `local` ↔ `supabase` par variable d'env.
- **Géocodage** Base Adresse Nationale (officiel, gratuit, sans clé).
- **72 tests** unitaires (cœur métier, ingestion, mappers, géocodeur, file de synchro).

## 🚧 Ce qui reste à durcir (honnêteté)

- Connecteurs `authorized_api` par source : **non implémentés** (dépendent de
  l'existence d'une API/flux autorisé — voir hypothèses ci-dessous).
- **Web Push** (signature VAPID + chiffrement) et **e-mail** dans `notify` :
  stubs ; le **webhook** (Telegram/Slack) est fonctionnel.
- Cœur métier `src/domain` + `src/ingestion` partagé avec les Edge Functions
  (Deno) en **package commun**, pour rejouer la même logique côté serveur.
- **Ouverture publique** : configurer un **SMTP custom** (l'e-mail Supabase par
  défaut est plafonné, ~quelques envois/h) et arrêter la **politique d'inscription**
  (ouverte vs comptes créés à la main).

## ⚠️ Hypothèses & incertitudes (rien d'inventé)

- À la connaissance de ce projet, **leboncoin / SeLoger / Bien'ici / PAP
  n'exposent pas d'API publique tierce** pour la veille, et leurs CGU encadrent
  l'usage automatisé. ⇒ la collecte par défaut est **import/capture utilisateur**.
- **Géocodage** : Base Adresse Nationale `api-adresse.data.gouv.fr` (officiel,
  gratuit, sans clé) — vérifié comme service public.
- **Web Push** sur iOS nécessite une PWA **installée** (iOS ≥ 16.4) — à tester.
- Toute activation d'un `server_fetch` doit être vérifiée **au cas par cas**
  (robots.txt + CGU) avant mise en service.

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
│  Edge Function `notify` (webhook / [push,email à durcir])                        │
│  Storage privé `listing-media`                                                   │
└──────────────────────────────────────────────────────────────────────────────────┘
```

## 🚀 Démarrer en local

```bash
# 1) Auth GitHub Packages (config famille @mister-guiiug)
export NODE_AUTH_TOKEN="$(gh auth token)"   # nécessite le scope read:packages

# 2) Installer + lancer (port 5214)
npm install
npm run dev
```

Ouvrez http://localhost:5214/ — l'app démarre en **mode démo local** avec un jeu
de données fictif. Essayez **Importer** (charger l'exemple) pour voir le moteur
dédupliquer/scorer/notifier en direct.

### Scripts

| Script                  | Rôle                                    |
| ----------------------- | --------------------------------------- |
| `npm run dev`           | Serveur de dev (port 5214)              |
| `npm test`              | Tests unitaires (Vitest)                |
| `npm run type-check`    | Typage strict (TS `tsc -b`)             |
| `npm run lint`          | ESLint                                  |
| `npm run format`        | Prettier (la CI vérifie `format:check`) |
| `npm run build`         | Build de production                     |
| `npm run supabase:push` | Applique les migrations (CLI Supabase)  |

## 🔐 Mode Supabase

Le backend est **provisionné, validé en live** (isolation RLS par compte prouvée)
et le **site déployé tourne en mode Supabase** (authentification requise). Détails
techniques (migrations, RLS, planification, Edge Functions, secrets) :
**[`supabase/README.md`](supabase/README.md)**.

- **Dev local branché Supabase** : copier `.env.example` → `.env.local` et
  renseigner `VITE_BACKEND=supabase` + URL + **clé anon publiques**.
- **Build de production** : lit `.env.production` (versionné, **valeurs publiques
  uniquement** ; la RLS arbitre tous les accès).

> Les secrets (`service_role`, mot de passe DB, `INGEST_TOKEN`, clé VAPID privée)
> ne vivent **jamais** dans le dépôt — uniquement dans les secrets Supabase /
> Edge Functions.

## 🌐 Déploiement (GitHub Pages)

CI/CD délégués aux workflows réutilisables famille (`pwa-ci.yml@v1`,
`pwa-deploy.yml@v1`). `base` = `/miss-lookhouse/`, HashRouter. Le site atterrit sur
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
- [ ] Connecteurs `authorized_api` réels (par source autorisée)
- [ ] Web Push (VAPID) + e-mail (résumé quotidien/hebdo)
- [ ] Cœur métier partagé front ↔ Edge Functions (package commun)
- [ ] Prix de référence (DVF, à confirmer)

### V3

- [x] Carte interactive (marqueurs + zones)
- [ ] Dessin de **polygone** de zone sur la carte
- [ ] Similarité par **embeddings** (pgvector) en option (après l'heuristique)
- [ ] Multi-zones, partage de recherches, rôles d'équipe
- [ ] Observabilité (métriques pipeline, dashboards), alerting
- [ ] **SMTP custom** + politique d'inscription (ouverture publique)

## 🧪 Tests

```bash
npm test
```

Couvrent : normalisation FR, similarité textuelle/géo/image, scoring, deltas de
prix, clustering, **plan d'ingestion** (nouveau vs maj, baisse de prix, recyclage,
exclusion hors zone), **mappers** Supabase, **géocodeur** BAN et **file de synchro**.

## 📁 Structure

```
src/
  domain/      cœur PUR (similarité, scoring, géo, images, historisation) + tests
  ingestion/   connecteurs + schema (zod) + pipeline + bookmarklet + tests
  store/       Zustand (mode local) + persistance + démo
  backend/     sélection backend, client, mappers, dépôt, file de synchro
  auth/        AuthProvider + AuthGate
  components/  layout, nav, menu d'en-tête, UI (badges, sparkline)
  features/    écrans (dashboard, searches, listings, similar, map,
               notifications, processing, settings, import)
  lib/         formatage, géocodeur (BAN), appui long
supabase/
  migrations/  0001_schema · 0002_rls · 0003_seed · 0004_scheduling · 0005_notifications_dispatch
  functions/   ingest-run · notify · _shared
```

## 📝 Licence

MIT — © famille mister-guiiug. Soutien : Buy Me a Coffee (`mister.guiiug`).
