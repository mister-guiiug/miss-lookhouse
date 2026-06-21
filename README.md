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

## ✨ Ce qui est déjà là

- **Cœur métier pur & testé** (`src/domain`) : similarité explicable (texte,
  prix, surface, pièces, géo, **hash perceptuel d'images**, contact), scoring de
  pertinence/fraîcheur, détection de **baisse de prix** et de **republication**,
  historisation (deltas + série de prix), **clustering** de doublons.
- **Pipeline d'ingestion pur & testé** (`src/ingestion`) : connecteurs
  (import manuel, URL de recherche, stub API autorisée), validation Zod, plan
  d'actions idempotent (insert/update/version/similarité/notifications).
- **PWA fonctionnelle en mode local** : la démo tourne **sans backend**
  (données dans le navigateur). Import réel → dédup → scoring → notifications,
  exécutés par le moteur dans le navigateur.
- **Schéma Supabase complet + RLS deny-by-default + audit + planification**
  (`supabase/migrations`), Edge Functions (`ingest-run`, `notify`).
- **~45 tests** unitaires sur le cœur métier et l'ingestion.

## 🚧 Ce qui reste à durcir (honnêteté)

- Connecteurs `authorized_api` par source : **non implémentés** (dépendent de
  l'existence d'une API/flux autorisé — voir hypothèses ci-dessous).
- **Web Push** (signature VAPID + chiffrement) et **e-mail** dans `notify` :
  stubs ; le **webhook** (Telegram/Slack) est fonctionnel.
- Partage du cœur métier `src/domain` + `src/ingestion` en **package commun**
  importé par les Edge Functions (Deno) pour rejouer la même logique côté serveur.
- Auth Supabase in-app (écran login/MFA) : à câbler (le client est prêt).

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

Voir **[`supabase/README.md`](supabase/README.md)** (migrations, RLS,
planification, Edge Functions, secrets). Côté front, copier `.env.example` →
`.env.local` et renseigner `VITE_BACKEND=supabase` + URL + clé anon **publiques**.

## 🌐 Déploiement (GitHub Pages)

CI/CD délégués aux workflows réutilisables famille (`pwa-ci.yml@v1`,
`pwa-deploy.yml@v1`). `base` = `/miss-lookhouse/`, HashRouter. Le site atterrit sur
`https://mister-guiiug.github.io/miss-lookhouse/`. Lancer `npx prettier --write .`
avant tout commit (la CI vérifie `prettier --check`).

---

## 🗺️ Backlog

### MVP (cœur livré dans ce squelette)

- [x] Cœur similarité/scoring/historisation testé
- [x] Pipeline d'ingestion (plan idempotent) testé
- [x] Création de recherches + import manuel + stockage local
- [x] Historique de prix + détection baisse/recyclage
- [x] Vue liste + détail + doublons + notifications + réglages
- [x] Tags / qualification manuelle
- [x] Schéma Supabase + RLS + planification + Edge Functions
- [ ] Auth Supabase in-app (login/inscription) + bascule local↔supabase
- [ ] Adaptateur dépôt Supabase (lecture/écriture branchée sur le store)

### V2

- [ ] Connecteurs `authorized_api` réels (par source autorisée)
- [ ] Web Push (VAPID) + e-mail (résumé quotidien/hebdo)
- [ ] Capture navigateur (extension/bookmarklet) initiée par l'utilisateur
- [ ] Cœur métier partagé front ↔ Edge Functions (package commun)
- [ ] Vérification métier (checklist, niveau de confiance, anomalies)
- [ ] Enrichissement géocodage (BAN) + prix de référence (DVF, à confirmer)

### V3

- [ ] Similarité par **embeddings** (pgvector) en option (après l'heuristique)
- [ ] Carte interactive + dessin de polygone de zone
- [ ] Multi-zones, partage de recherches, rôles d'équipe
- [ ] Observabilité (métriques pipeline, dashboards), alerting

## 🧪 Tests

```bash
npm test
```

Couvrent : normalisation FR, similarité textuelle/géo/image, scoring, deltas de
prix, clustering, et le **plan d'ingestion** (nouveau vs maj, baisse de prix,
recyclage, exclusion hors zone).

## 📁 Structure

```
src/
  domain/      cœur PUR (similarité, scoring, géo, images, historisation) + tests
  ingestion/   connecteurs + schema (zod) + pipeline + tests
  store/       Zustand (mode local) + persistance + démo
  backend/     sélection backend + client Supabase
  components/  layout, nav, UI (badges, sparkline)
  features/    écrans (dashboard, searches, listings, similar, notifications, settings, import)
  lib/         formatage
supabase/
  migrations/  0001_schema · 0002_rls · 0003_seed · 0004_scheduling
  functions/   ingest-run · notify · _shared
```

## 📝 Licence

MIT — © famille mister-guiiug. Soutien : Buy Me a Coffee (`mister.guiiug`).
