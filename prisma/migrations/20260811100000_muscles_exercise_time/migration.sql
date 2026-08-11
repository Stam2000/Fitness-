-- Muscles principaux travaillés par exercice/variante (renseignés par l'IA).
ALTER TABLE "Exercise" ADD COLUMN "muscles" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "ExerciseVariation" ADD COLUMN "muscles" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- Temps passé par exercice pendant une séance : { [exerciseId]: secondes }.
ALTER TABLE "WorkoutSession" ADD COLUMN "exerciseSeconds" JSONB NOT NULL DEFAULT '{}';
