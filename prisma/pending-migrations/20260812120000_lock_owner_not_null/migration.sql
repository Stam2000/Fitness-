-- Comptes utilisateurs — étape 2/2. NE PAS DÉPLOYER AVANT /setup.
--
-- Ce dossier n'est PAS scanné par `prisma migrate deploy` (seul
-- prisma/migrations l'est) : la migration reste inerte tant qu'on ne la
-- déplace pas. C'est volontaire.
--
-- Mode d'emploi, une fois la page /setup passée en production (vérifier que
-- chaque compteur ci-dessous vaut 0) :
--
--   SELECT
--     (SELECT count(*) FROM "Location"        WHERE "userId" IS NULL) AS lieux,
--     (SELECT count(*) FROM "Program"         WHERE "userId" IS NULL) AS programmes,
--     (SELECT count(*) FROM "WorkoutSession"  WHERE "userId" IS NULL) AS seances,
--     (SELECT count(*) FROM "BodyMeasurement" WHERE "userId" IS NULL) AS mesures,
--     (SELECT count(*) FROM "ProgressPhoto"   WHERE "userId" IS NULL) AS photos,
--     (SELECT count(*) FROM "ChatConversation" WHERE "userId" IS NULL) AS chats;
--
--   1. déplacer ce dossier dans prisma/migrations/
--   2. retirer le « ? » de userId sur les six modèles de schema.prisma
--      (et de la relation `user User?` correspondante)
--   3. npx prisma format && npx prisma generate
--   4. docker compose run --rm --build migrate
--
-- Si un compteur n'est pas à zéro, la migration échoue — c'est le garde-fou
-- recherché : des données resteraient inaccessibles, sans propriétaire.
-- Les clés étrangères, elles, sont déjà posées par la migration `add_auth`.

ALTER TABLE "Location" ALTER COLUMN "userId" SET NOT NULL;
ALTER TABLE "Program" ALTER COLUMN "userId" SET NOT NULL;
ALTER TABLE "WorkoutSession" ALTER COLUMN "userId" SET NOT NULL;
ALTER TABLE "BodyMeasurement" ALTER COLUMN "userId" SET NOT NULL;
ALTER TABLE "ProgressPhoto" ALTER COLUMN "userId" SET NOT NULL;
ALTER TABLE "ChatConversation" ALTER COLUMN "userId" SET NOT NULL;
