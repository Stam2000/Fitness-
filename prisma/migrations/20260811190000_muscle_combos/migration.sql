-- Combinaisons de groupes musculaires (≥ 2 muscles) avec illustration dédiée,
-- réutilisée entre tous les exercices ciblant la même combinaison.
CREATE TABLE "MuscleCombo" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "muscles" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "imageUrl" TEXT,
    "imageTaskId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MuscleCombo_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MuscleCombo_key_key" ON "MuscleCombo"("key");
