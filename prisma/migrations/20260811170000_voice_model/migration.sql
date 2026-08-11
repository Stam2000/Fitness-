-- Modèle acceptant l'audio en entrée, utilisé pour la dictée directe au
-- micro (écoute + interprétation par le modèle via OpenRouter).
ALTER TABLE "Settings" ADD COLUMN "voiceModel" TEXT NOT NULL DEFAULT 'google/gemini-2.5-flash';
