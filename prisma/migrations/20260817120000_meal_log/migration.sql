-- Journal des repas photographiés : une ligne Meal par cliché, une ligne
-- MealItem par aliment reconnu ou par hypothèse posée par le modèle.
--
-- Migration purement additive : deux tables neuves, leurs index et une
-- colonne de réglage. Aucun DROP, aucun DELETE, aucun UPDATE — ces repas
-- n'existaient pas avant, et le modèle de vision arrive avec la même valeur
-- par défaut que le modèle vocal, si bien qu'une instance déjà en service
-- reste fonctionnelle sans passer par Réglages.
--
-- "Meal"."userId" est NOT NULL dès le départ, contrairement aux tables
-- historiques (Location, ProgressPhoto…) laissées nullables le temps de la
-- reprise : aucun repas ne peut précéder l'arrivée des comptes. Elle n'a donc
-- rien à faire dans pending-migrations/lock_owner_not_null.
--
-- Aucun total n'est stocké : il se recalcule depuis les lignes retenues
-- (src/lib/meals.ts). Répondre à une hypothèse doit rester l'écriture d'une
-- seule ligne, pas une transaction.
CREATE TABLE "Meal" (
    "id" TEXT NOT NULL,
    "eatenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "imageUrl" TEXT,
    "note" TEXT,
    "title" TEXT,
    -- « pending » | « ready » | « failed » : la ligne naît à l'envoi de la
    -- photo, l'analyse suit dans une seconde requête.
    "status" TEXT NOT NULL DEFAULT 'pending',
    "error" TEXT,
    "model" TEXT,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "Meal_pkey" PRIMARY KEY ("id")
);

-- « detected » (vu, retenu) | « hypothesis » (question fermée, écartée tant
-- qu'elle n'a pas de réponse) | « manual » (réservé).
CREATE TABLE "MealItem" (
    "id" TEXT NOT NULL,
    "mealId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "quantityLabel" TEXT,
    "grams" DOUBLE PRECISION,
    "kcal" INTEGER NOT NULL DEFAULT 0,
    "proteinG" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "carbsG" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "fatG" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "kind" TEXT NOT NULL DEFAULT 'detected',
    "question" TEXT,
    "included" BOOLEAN NOT NULL DEFAULT true,
    -- NULL = l'utilisateur n'a pas encore tranché, ce qui n'est pas un refus.
    "answeredAt" TIMESTAMP(3),
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MealItem_pkey" PRIMARY KEY ("id")
);

-- Le journal se lit toujours « les repas d'un compte, sur une journée » :
-- l'index composite couvre exactement cette requête.
CREATE INDEX "Meal_userId_eatenAt_idx" ON "Meal"("userId", "eatenAt");

CREATE INDEX "MealItem_mealId_idx" ON "MealItem"("mealId");

-- AddForeignKey
ALTER TABLE "Meal" ADD CONSTRAINT "Meal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MealItem" ADD CONSTRAINT "MealItem_mealId_fkey" FOREIGN KEY ("mealId") REFERENCES "Meal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Modèle acceptant les images, réglable comme le modèle vocal. Le défaut
-- reprend celui de "voiceModel" : Gemini Flash lit l'image comme il écoute
-- l'audio, et l'admin peut en changer depuis Réglages sans toucher au code.
ALTER TABLE "Settings" ADD COLUMN "visionModel" TEXT NOT NULL DEFAULT 'google/gemini-2.5-flash';
