-- Nombre de pas lu sur l'afficheur du tapis : optionnel, les séances
-- antérieures restent valides sans lui.
ALTER TABLE "CardioSession" ADD COLUMN "steps" INTEGER;
