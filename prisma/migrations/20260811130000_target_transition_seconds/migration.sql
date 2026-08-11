-- Temps cible d'exécution (séries + repos) et temps de transition vers
-- l'exercice suivant, définis par l'IA.
ALTER TABLE "Exercise" ADD COLUMN "targetSeconds" INTEGER;
ALTER TABLE "Exercise" ADD COLUMN "transitionSeconds" INTEGER;
ALTER TABLE "ExerciseVariation" ADD COLUMN "targetSeconds" INTEGER;
