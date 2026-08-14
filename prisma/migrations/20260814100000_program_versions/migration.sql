-- Versionnage du programme et journal de séance immuable.
--
-- Jusqu'ici, modifier un programme réécrivait le passé : supprimer un exercice
-- effaçait ses séries (cascade), supprimer un jour effaçait des séances
-- entières, et renommer un exercice réattribuait rétroactivement son
-- historique. Cette migration détache le journal du plan vivant.

-- ---------------------------------------------------------------------------
-- 1. SetLog : `exerciseId` devient un identifiant de journal (plus de clé
--    étrangère) et le nom de l'exercice est figé à l'écriture.
-- ---------------------------------------------------------------------------

ALTER TABLE "SetLog" DROP CONSTRAINT "SetLog_exerciseId_fkey";

ALTER TABLE "SetLog" ADD COLUMN "exerciseName" TEXT;

UPDATE "SetLog" sl
SET "exerciseName" = e."name"
FROM "Exercise" e
WHERE e."id" = sl."exerciseId";

-- Aucune série orpheline ne devrait exister (la cascade les supprimait), mais
-- la colonne est obligatoire : on ne peut pas laisser passer un NULL.
UPDATE "SetLog" SET "exerciseName" = 'Exercice' WHERE "exerciseName" IS NULL;

ALTER TABLE "SetLog" ALTER COLUMN "exerciseName" SET NOT NULL;

CREATE INDEX "SetLog_exerciseName_idx" ON "SetLog"("exerciseName");

-- ---------------------------------------------------------------------------
-- 2. WorkoutSession : détachable de son jour, et porteuse de son propre plan.
-- ---------------------------------------------------------------------------

ALTER TABLE "WorkoutSession" DROP CONSTRAINT "WorkoutSession_dayId_fkey";
ALTER TABLE "WorkoutSession" ALTER COLUMN "dayId" DROP NOT NULL;
ALTER TABLE "WorkoutSession" ADD CONSTRAINT "WorkoutSession_dayId_fkey"
    FOREIGN KEY ("dayId") REFERENCES "ProgramDay"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "WorkoutSession" ADD COLUMN "planSnapshot" JSONB;
ALTER TABLE "WorkoutSession" ADD COLUMN "programVersionId" TEXT;

-- ---------------------------------------------------------------------------
-- 3. ProgramVersion : état figé du plan après chaque modification.
-- ---------------------------------------------------------------------------

CREATE TABLE "ProgramVersion" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'edit',
    "note" TEXT,
    "snapshot" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProgramVersion_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProgramVersion_programId_versionNumber_key" ON "ProgramVersion"("programId", "versionNumber");
CREATE INDEX "ProgramVersion_programId_createdAt_idx" ON "ProgramVersion"("programId", "createdAt");

ALTER TABLE "ProgramVersion" ADD CONSTRAINT "ProgramVersion_programId_fkey"
    FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WorkoutSession" ADD CONSTRAINT "WorkoutSession_programVersionId_fkey"
    FOREIGN KEY ("programVersionId") REFERENCES "ProgramVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- 4. Reprise des données existantes.
--
-- Le plan actuel devient la version 1 de chaque programme, et le plan figé de
-- chaque séance déjà enregistrée. C'est exactement ce que l'interface affichait
-- jusqu'ici pour ces séances : la reprise ne change donc rien à ce qui est lu,
-- elle le rend seulement insensible aux modifications à venir.
-- ---------------------------------------------------------------------------

-- Exercices d'un jour, ordonnés, avec leurs variantes.
CREATE OR REPLACE VIEW "_migration_day_exercises" AS
SELECT
    d."id" AS "dayId",
    COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'id', e."id",
                'order', e."order",
                'name', e."name",
                'sets', e."sets",
                'reps', e."reps",
                'restSeconds', e."restSeconds",
                'weightHint', e."weightHint",
                'equipment', to_jsonb(e."equipment"),
                'muscles', to_jsonb(e."muscles"),
                'targetSeconds', e."targetSeconds",
                'setSeconds', e."setSeconds",
                'transitionSeconds', e."transitionSeconds",
                'notes', e."notes",
                'imageUrl', e."imageUrl",
                'videoUrl', e."videoUrl",
                'variations', COALESCE(v."variations", '[]'::jsonb)
            )
            ORDER BY e."order"
        ) FILTER (WHERE e."id" IS NOT NULL),
        '[]'::jsonb
    ) AS "exercises"
FROM "ProgramDay" d
LEFT JOIN "Exercise" e ON e."dayId" = d."id"
LEFT JOIN LATERAL (
    SELECT jsonb_agg(
        jsonb_build_object(
            'id', ev."id",
            'name', ev."name",
            'sets', ev."sets",
            'reps', ev."reps",
            'restSeconds', ev."restSeconds",
            'weightHint', ev."weightHint",
            'equipment', to_jsonb(ev."equipment"),
            'muscles', to_jsonb(ev."muscles"),
            'targetSeconds', ev."targetSeconds",
            'setSeconds', ev."setSeconds",
            'notes', ev."notes",
            'imageUrl', ev."imageUrl",
            'videoUrl', ev."videoUrl"
        )
        ORDER BY ev."order"
    ) AS "variations"
    FROM "ExerciseVariation" ev
    WHERE ev."exerciseId" = e."id"
) v ON TRUE
GROUP BY d."id";

-- Version 1 de chaque programme.
INSERT INTO "ProgramVersion" ("id", "programId", "versionNumber", "source", "note", "snapshot", "createdAt")
SELECT
    gen_random_uuid()::text,
    p."id",
    1,
    'creation',
    'État repris lors de la mise en place du versionnage',
    jsonb_build_object(
        'name', p."name",
        'description', p."description",
        'days', COALESCE(
            (
                SELECT jsonb_agg(
                    jsonb_build_object(
                        'id', d."id",
                        'name', d."name",
                        'focus', d."focus",
                        'exercises', de."exercises"
                    )
                    ORDER BY d."dayIndex"
                )
                FROM "ProgramDay" d
                JOIN "_migration_day_exercises" de ON de."dayId" = d."id"
                WHERE d."programId" = p."id"
            ),
            '[]'::jsonb
        )
    ),
    p."createdAt"
FROM "Program" p;

-- Plan figé de chaque séance existante, rattaché à cette version 1.
UPDATE "WorkoutSession" s
SET
    "planSnapshot" = jsonb_build_object(
        'programId', p."id",
        'programName', p."name",
        'dayId', d."id",
        'dayName', d."name",
        'dayFocus', d."focus",
        'exercises', de."exercises"
    ),
    "programVersionId" = pv."id"
FROM "ProgramDay" d
JOIN "Program" p ON p."id" = d."programId"
JOIN "_migration_day_exercises" de ON de."dayId" = d."id"
JOIN "ProgramVersion" pv ON pv."programId" = p."id" AND pv."versionNumber" = 1
WHERE s."dayId" = d."id";

DROP VIEW "_migration_day_exercises";
