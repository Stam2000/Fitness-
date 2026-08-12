-- Objectifs nutritionnels : poids visé, calories et protéines quotidiennes.
-- Une ligne par compte (userId en clé primaire), supprimée avec le compte.
CREATE TABLE "NutritionGoal" (
    "userId" TEXT NOT NULL,
    "objective" TEXT NOT NULL DEFAULT 'gain',
    "activity" TEXT NOT NULL DEFAULT 'moderate',
    "targetWeightKg" DOUBLE PRECISION,
    "dailyCalories" INTEGER,
    "dailyProteinG" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NutritionGoal_pkey" PRIMARY KEY ("userId")
);

-- AddForeignKey
ALTER TABLE "NutritionGoal" ADD CONSTRAINT "NutritionGoal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
