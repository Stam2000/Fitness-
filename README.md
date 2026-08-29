# Mon Coach Fitness 💪

Application web de programmes de fitness générés par IA, adaptée au téléphone,
à la tablette et à l'ordinateur : barre de navigation en bas sur mobile, barre
latérale (icônes seules sur tablette, icônes + libellés sur ordinateur), et
mises en page multi-colonnes sur grand écran.

## Fonctionnalités

- **Contextes d'entraînement dynamiques** : crée tes propres lieux
  (« Maison », « Gym X », « Gym Y », …) et coche l'équipement disponible dans
  chacun — haltères, machines, cardio, accessoires.
- **Génération par IA (OpenRouter)** : choisis ton modèle d'IA, ton objectif,
  ton niveau, le nombre de séances par semaine — l'IA propose un programme
  qui n'utilise que ton équipement. Tu peux le modifier avant de l'enregistrer.
- **Plusieurs programmes** enregistrés, démarrables jour par jour : à la maison
  tu lances le programme maison, à la salle le programme salle.
- **Lecteur de séance** : coche tes séries, saisis (ou **dicte à la voix** 🎤)
  tes poids et répétitions, chrono de repos automatique avec annonces vocales,
  **minuteur d'échauffement** (2/5/10 min) et **chrono intégré** pour les
  exercices en secondes (planche, corde à sauter…) avec validation automatique
  de la série.
- **Tapis de course** 🏃 : saisie rapide sur l'accueil (vitesse, durée, pente,
  poids) avec **calcul automatique des calories** et de la distance, recalculé
  à chaque frappe. Les séances alimentent le calendrier de suivi, les totaux et
  l'historique.
- **Suivi d'activité** 🗓️ : calendrier mensuel de tes jours d'entraînement
  (tape un jour pour voir les séances faites), série de semaines consécutives,
  séances par semaine sur 12 semaines, répartition par type de séance, temps
  et volume cumulés.
- **Historique & progression** : volume soulevé, séries, durée de chaque
  séance ; courbes de progression par exercice avec records personnels (★) et
  suggestions de surcharge progressive pendant la séance.
- **Coach IA post-séance** : analyse de ta séance (charges, séries manquées,
  conseils) générée par le modèle OpenRouter de ton choix.
- **IA en séance** : remplace un exercice à la volée (machine occupée,
  douleur…) par une alternative équivalente, échauffement sur mesure généré
  pour la séance du jour.
- **Gestion des programmes** : duplication en un clic et **adaptation IA d'un
  programme à un autre contexte** (ex. ton programme salle converti pour la
  maison avec ton équipement).
- **Images d'exercices** générées avec **GPT Image 2** via [Kie.ai](https://kie.ai).

## Stack

- [Next.js](https://nextjs.org) (App Router, TypeScript)
- [Tailwind CSS v4](https://tailwindcss.com)
- [Prisma](https://prisma.io) + PostgreSQL
- [OpenRouter](https://openrouter.ai) (génération des programmes)
- [Kie.ai](https://kie.ai) GPT Image 2 (images d'exercices)
- [Better Auth](https://better-auth.com) (comptes, sessions, rôles)
- Web Speech API (dictée et annonces vocales, fr-FR)

## Comptes et invitations 🔐

L'application est multi-utilisateur : chacun a ses contextes, ses programmes,
son historique, ses mesures et ses photos. Restent **communs** à l'instance :
le catalogue de matériel, les muscles, les vidéos de mouvement téléchargées,
et les clés API — c'est le budget de l'administrateur qui est consommé, d'où
l'inscription fermée.

Variables d'environnement à définir (voir `.env.example`) :

| Variable | Rôle |
| --- | --- |
| `BETTER_AUTH_SECRET` | Signe les sessions. Obligatoire. Le changer déconnecte tout le monde. |
| `BETTER_AUTH_URL` | URL publique de l'app (sans barre oblique finale). |
| `SETUP_TOKEN` | Protège `/setup`. Retirable une fois le premier compte créé. |

Générer un secret :

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

**Premier démarrage** — ouvre `/setup?token=<SETUP_TOKEN>` et crée le compte
administrateur. Toutes les données déjà en base (celles d'avant l'arrivée des
comptes) lui sont rattachées dans la foulée, en une transaction. La page se
verrouille définitivement dès qu'un compte existe.

**Inviter quelqu'un** — Réglages → Invitations → *Générer*, puis partage le
lien copié. Sans code valide, `/register` refuse la création de compte, et le
point d'entrée HTTP `POST /api/auth/sign-up/email` est fermé.

### Mise à jour d'une instance existante (données en production)

La reprise se fait en **deux déploiements**, pour ne rien perdre :

1. Déploie ce code. La migration `add_auth` n'ajoute que des tables, des
   colonnes et des index — aucun `DROP`, aucun `DELETE`. La colonne `userId`
   arrive vide.
2. Passe par `/setup` : le compte admin est créé et adopte les lignes sans
   propriétaire.
3. Une fois vérifié (voir le mode d'emploi en tête de
   `prisma/pending-migrations/20260812120000_lock_owner_not_null/migration.sql`),
   déplace cette migration dans `prisma/migrations/`, retire les `?` des six
   colonnes `userId` du schéma et redéploie : les colonnes passent en
   `NOT NULL`.

Un instantané avant l'opération ne coûte rien :

```bash
docker compose exec db pg_dump -U fitness fitness > sauvegarde-avant-auth.sql
```

## Démarrage rapide avec Docker 🐳

Le plus simple : l'app **et** la base PostgreSQL tournent dans Docker.

```bash
docker compose up -d --build
```

Pour les clés API, le plus simple est de les saisir dans la page **Réglages**
de l'application (elles sont stockées en base et survivent aux redémarrages).
Sinon, crée un fichier `.env` à côté de `docker-compose.yml` — Docker Compose
le lit automatiquement :

```env
KIE_API_KEY=ta-clé-kie
OPENROUTER_API_KEY=sk-or-…
BETTER_AUTH_SECRET=…   # obligatoire, voir « Comptes et invitations »
SETUP_TOKEN=…          # protège la création du premier compte
```

Puis ouvre <http://localhost:4000>. C'est tout : le conteneur applicatif
applique lui-même les migrations et le seed à chaque démarrage, et les données
sont persistées dans le volume `db-data`.

- Changer le port : `APP_PORT=8080 docker compose up -d`
- Mot de passe Postgres : `POSTGRES_PASSWORD=… docker compose up -d`
- Mise à jour : `git pull && docker compose up -d --build` (les migrations
  se rejouent automatiquement)
- Arrêt : `docker compose down` (ajoute `-v` pour effacer les données)

## Démarrage manuel (sans Docker)

1. Crée une base PostgreSQL (gratuite chez [Neon](https://neon.tech) ou
   [Supabase](https://supabase.com)).
2. Copie `.env.example` vers `.env` et renseigne :
   - `DATABASE_URL` — l'URL de ta base Postgres
   - `KIE_API_KEY` — ta clé [kie.ai](https://kie.ai) (ou saisis-la dans Réglages)
   - `OPENROUTER_API_KEY` — ta clé [openrouter.ai](https://openrouter.ai)
     (ou saisis-la dans Réglages)
3. Installe et initialise :

```bash
npm install
npx prisma migrate deploy   # crée les tables
npx prisma db seed          # catalogue d'équipements
npm run dev
```

Ouvre <http://localhost:3000> (idéalement depuis ton téléphone — l'interface
est pensée mobile, ajoutable à l'écran d'accueil en PWA).

## Déploiement (Vercel)

1. Importe le repo sur [Vercel](https://vercel.com).
2. Ajoute les variables d'environnement `DATABASE_URL`, `KIE_API_KEY`,
   `OPENROUTER_API_KEY`.
3. Après le premier déploiement, exécute les migrations :
   `npx prisma migrate deploy && npx prisma db seed` (en local, pointé sur la
   base de production).

## Pourquoi les images n'apparaissent-elles pas ? 🎨

Les images ne sont **jamais générées automatiquement** (chaque image est un
appel payant à Kie.ai). Il faut donc :

1. renseigner une clé Kie.ai — page **Réglages**, ou variable `KIE_API_KEY` ;
2. lancer la génération : bouton **« 🎨 Générer les images des équipements »**
   sur la page Matériel, la pastille 🎨 d'une carte, ou la commande ci-dessous.

Sans clé, la page Matériel affiche un rappel avec un lien vers les Réglages.

## Générer toutes les images en une commande 🎨

Plutôt que d'appuyer sur les boutons un par un, tu peux générer d'un coup
toutes les images manquantes (équipements + exercices) avec GPT Image 2 :

```bash
npm run images:generate                 # tout ce qui manque
npm run images:generate -- --equipment  # équipements uniquement
npm run images:generate -- --exercises  # exercices uniquement
npm run images:generate -- --force      # régénère aussi celles déjà présentes
```

Avec Docker : `docker compose run --rm migrate npm run images:generate`.

Le script génère 3 images en parallèle, attend le résultat de chaque tâche et
enregistre les URLs en base ; les exercices de même nom partagent la même
image. Relance la commande pour rattraper les échecs éventuels.

## Comment sont calculées les calories du tapis ? 🔥

L'estimation repose sur les **équations métaboliques de l'ACSM**, qui donnent la
consommation d'oxygène à partir de la vitesse **et de la pente** :

- marche : `VO2 = 0,1 × S + 1,8 × S × G + 3,5`
- course : `VO2 = 0,2 × S + 0,9 × S × G + 3,5`

(`S` en m/min, `G` la pente en fraction ; interpolation entre 6,4 et 8 km/h, où
ni l'une ni l'autre n'est validée). Les calories en découlent via
`kcal/min = VO2 × poids / 1000 × 5`, un litre d'oxygène consommé valant environ
5 kcal. Voir `src/lib/cardio.ts`.

Le poids proposé est celui de ta **dernière pesée** (page Corps), à défaut celui
de ta dernière séance de tapis, sinon 70 kg ; il est figé sur chaque séance
enregistrée pour que l'historique ne bouge plus. Comme sur les tapis du
commerce, il s'agit d'une dépense *brute* — métabolisme de repos compris — donc
d'un ordre de grandeur, pas d'une mesure.

## Notes

- Les clés API saisies dans **Réglages** sont stockées en base et priment sur
  les variables d'environnement. Aucune clé n'est exposée côté client.
- Les URLs d'images Kie.ai expirent après ~14 jours : un bouton
  « régénérer » est disponible sur chaque exercice.
