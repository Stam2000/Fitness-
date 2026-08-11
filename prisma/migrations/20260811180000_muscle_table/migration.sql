-- Catalogue des groupes musculaires (liste seedée + ajouts créés par l'IA),
-- avec image générée via Kie.ai (imageTaskId = tâche en cours).
CREATE TABLE "Muscle" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "imageUrl" TEXT,
    "imageTaskId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Muscle_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Muscle_name_key" ON "Muscle"("name");
