-- Temps cible d'exécution d'UNE série, défini par l'IA (rythme
-- série → pause → série du lecteur de séance).
ALTER TABLE "Exercise" ADD COLUMN "setSeconds" INTEGER;
ALTER TABLE "ExerciseVariation" ADD COLUMN "setSeconds" INTEGER;
