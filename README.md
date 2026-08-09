# Mon Coach Fitness 💪

Application web mobile-first de programmes de fitness générés par IA.

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
- **Historique & progression** : volume soulevé, séries, durée de chaque
  séance ; courbes de progression par exercice avec records personnels (★) et
  suggestions de surcharge progressive pendant la séance.
- **Coach IA post-séance** : analyse de ta séance (charges, séries manquées,
  conseils) générée par le modèle OpenRouter de ton choix.
- **Images d'exercices** générées avec **GPT Image 2** via [Kie.ai](https://kie.ai).

## Stack

- [Next.js](https://nextjs.org) (App Router, TypeScript)
- [Tailwind CSS v4](https://tailwindcss.com)
- [Prisma](https://prisma.io) + PostgreSQL
- [OpenRouter](https://openrouter.ai) (génération des programmes)
- [Kie.ai](https://kie.ai) GPT Image 2 (images d'exercices)
- Web Speech API (dictée et annonces vocales, fr-FR)

## Démarrage

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

## Notes

- Les clés API saisies dans **Réglages** sont stockées en base et priment sur
  les variables d'environnement. Aucune clé n'est exposée côté client.
- Les URLs d'images Kie.ai expirent après ~14 jours : un bouton
  « régénérer » est disponible sur chaque exercice.
