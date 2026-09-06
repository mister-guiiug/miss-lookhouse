# ⚙️ Configuration — Miss LookHouse

_Ce que le dépôt attend de GitHub pour fonctionner, et qui doit le poser.
Relevé du **06/09/2026** ; la règle du parc est dans
[`dev-pwa-config/PARAMETRAGE.md`](https://github.com/mister-guiiug/dev-pwa-config/blob/main/PARAMETRAGE.md)._

---

## 🔴 En l'état : les migrations ne sont PAS appliquées

**Mesure du 06/09/2026.** Le workflow `Supabase migrations` a échoué à **ses
huit exécutions** depuis juin 2026 — aucune réussite :

```bash
gh run list -R mister-guiiug/miss-lookhouse --workflow="Supabase migrations"
```

Deux causes, cumulées :

1. **Le dépôt n'a aucun secret ni aucune variable** (`gh secret list` et
   `gh variable list` rendent une liste vide). Le journal imprimait
   `SUPABASE_ACCESS_TOKEN:` et `SUPABASE_DB_PASSWORD:` vides, puis
   « Access token not provided » — sans dire lequel des trois manquait.
2. **`SUPABASE_PROJECT_ID` n'était pas passé** dans le bloc `env:` de l'étape :
   `supabase link --project-ref ""` aurait échoué **même une fois les secrets
   posés** : la cible n'était nulle part.
   Bug latent, masqué par le premier.

Le point 2 est corrigé et une **étape de garde** nomme désormais les secrets
absents (voir [`.github/workflows/supabase-migrations.yml`](.github/workflows/supabase-migrations.yml)).
Le point 1 relève du **propriétaire du dépôt** : personne d'autre ne peut poser
un secret.

> ### ⚠️ Conséquence visible en production
>
> `.env.production` est versionné et porte `VITE_BACKEND=supabase` : le site
> déployé tourne **en mode compte**. La migration
> [`0013_delete_my_account.sql`](supabase/migrations/0013_delete_my_account.sql)
> (fusionnée par la PR #70) n'étant pas appliquée sur `ypcpvliriceprnmilxkd`, la
> carte **« Zone dangereuse » › « Supprimer mon compte »** appelle un RPC
> `delete_my_account` **qui n'existe pas sur le serveur**.
>
> L'écran échoue proprement — l'erreur s'affiche dans un `role="alert"` et
> l'utilisateur **n'est pas déconnecté** (épinglé par le test
> « le dit, et ne déconnecte pas » de
> [`src/features/settings/supprimer-son-compte.test.tsx`](src/features/settings/supprimer-son-compte.test.tsx))
> — mais **l'affordance est visible et inopérante** tant que 0013 n'est pas
> poussée. C'est la raison d'urgence de cette page.

---

## 1. Les trois secrets à poser

| Nom                     | Où le trouver                                          | Pourquoi c'est un secret                   |
| ----------------------- | ------------------------------------------------------ | ------------------------------------------ |
| `SUPABASE_ACCESS_TOKEN` | Supabase › Account › **Access Tokens** (motif `sbp_…`) | Pilote **tous** vos projets Supabase       |
| `SUPABASE_PROJECT_ID`   | Project Settings › General › **Reference ID**          | Désigne la cible ; voir la note ci-dessous |
| `SUPABASE_DB_PASSWORD`  | Project Settings › **Database**                        | Accès direct à la base, RLS non comprise   |

Pour ce projet, `SUPABASE_PROJECT_ID` vaut **`ypcpvliriceprnmilxkd`**.

> **Note honnête sur `SUPABASE_PROJECT_ID`.** La règle du parc est
> « `secrets` = ce qui donne un pouvoir, `vars` = tout ce que Vite copie dans le
> bundle ». Ce _reference ID_ ne donne aucun pouvoir à lui seul et il est **déjà
> public** : `.env.production` le publie dans `VITE_SUPABASE_URL`, donc dans le
> bundle servi. À la lettre de la règle, c'est une **variable**. Le workflow
> accepte les deux rangements (`secrets.SUPABASE_PROJECT_ID || vars.…`) pour que
> le choix reste au propriétaire sans que la CI échoue sur une subtilité.

### Les poser

Depuis l'interface : **Settings › Secrets and variables › Actions › New
repository secret**, trois fois.

Ou en ligne de commande — `gh` demande la valeur sur l'entrée standard, elle
n'apparaît donc **ni dans l'historique du shell ni dans un fichier** :

```bash
gh secret set SUPABASE_ACCESS_TOKEN -R mister-guiiug/miss-lookhouse
```

```bash
gh secret set SUPABASE_DB_PASSWORD -R mister-guiiug/miss-lookhouse
```

```bash
gh variable set SUPABASE_PROJECT_ID -R mister-guiiug/miss-lookhouse --body ypcpvliriceprnmilxkd
```

_(Le dernier en `gh secret set` si vous préférez le ranger en secret ; le
workflow lit les deux.)_

### Puis rattraper les migrations en attente

```bash
gh workflow run "Supabase migrations" -R mister-guiiug/miss-lookhouse
```

`db push` est **forward-only** : il ne rejoue que les migrations absentes de la
table `supabase_migrations.schema_migrations`. Aucune donnée n'est touchée.

**Combien en attente ? Personne ici ne le sait.** La CI n'en a jamais appliqué
une seule, mais le backend est provisionné et validé en live : il a donc été
poussé à la main, sans qu'on sache jusqu'où. Le seul relevé qui fasse foi est
celui du projet lui-même — voir §2.

---

## 2. À défaut : appliquer depuis un poste

Rien à poser sur GitHub. Il faut la CLI Supabase et le mot de passe de la base
(demandé interactivement par `link`) :

```bash
supabase link --project-ref ypcpvliriceprnmilxkd && supabase db push
```

Le dépôt expose le second geste en raccourci :

```bash
npm run supabase:push
```

C'est ce chemin qui a servi jusqu'ici — d'où un état de base **plus avancé que
ce que raconte la CI**. Vérifier ce qui manque réellement avant de conclure :

```bash
supabase migration list --linked
```

---

## 3. Vérifier que c'est réparé

```bash
gh run list -R mister-guiiug/miss-lookhouse --workflow="Supabase migrations" --limit 3
```

Et côté produit, une fois `0013` appliquée : Réglages › **Zone dangereuse** ›
« Supprimer mon compte » sur un compte de test — le compte doit disparaître au
lieu d'afficher une erreur. Le contrat serveur, lui, est déjà éprouvé en CI par
[`supabase/tests/delete_my_account.test.sql`](supabase/tests/delete_my_account.test.sql)
(workflow `Supabase tests`, vert), sur la même pile que l'hébergé : ce qui manque
n'est pas la preuve, c'est le `db push`.

---

## 4. Ce qui n'est **pas** ici

- **Les valeurs publiques du build** (`VITE_BACKEND`, `VITE_SUPABASE_URL`,
  `VITE_SUPABASE_ANON_KEY`, `VITE_GEOCODER_URL`, `VITE_VAPID_PUBLIC_KEY`) vivent
  dans [`.env.production`](.env.production), **versionné volontairement** : le
  navigateur les voit de toute façon, c'est la RLS qui arbitre les accès.
- **Les secrets d'Edge Functions** (`service_role`, `INGEST_TOKEN`, clé VAPID
  privée) se posent **côté Supabase**, pas sur GitHub :
  [`supabase/README.md`](supabase/README.md) §5.
- **Le déploiement GitHub Pages** n'a besoin d'aucun secret : le build lit
  `.env.production`.
