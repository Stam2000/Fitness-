-- Description détaillée d'exécution d'un mouvement (position de départ,
-- étapes, respiration, erreurs fréquentes), générée par l'IA à la demande.
ALTER TABLE "Exercise" ADD COLUMN "howTo" TEXT;
ALTER TABLE "ExerciseVariation" ADD COLUMN "howTo" TEXT;
