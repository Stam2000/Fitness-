import { prisma } from "@/lib/prisma";

export type ResolvedSettings = {
  openrouterApiKey: string | null;
  openrouterModel: string;
  pinnedModels: string[];
  kieApiKey: string | null;
  voiceModel: string;
  visionModel: string;
};

// Réglages GLOBAUX de l'instance : clés API et choix des modèles. C'est le
// budget de l'administrateur qui est consommé, lui seul peut les modifier
// (voir saveSettings dans src/app/actions.ts) — mais tous les comptes en
// bénéficient, d'où une lecture non filtrée.
//
// Les clés saisies dans Réglages (DB) priment sur les variables d'environnement.
export async function getSettings(): Promise<ResolvedSettings> {
  const s = await prisma.settings.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1 },
  });
  return {
    openrouterApiKey:
      s.openrouterApiKey || process.env.OPENROUTER_API_KEY || null,
    openrouterModel: s.openrouterModel,
    pinnedModels: s.pinnedModels,
    kieApiKey: s.kieApiKey || process.env.KIE_API_KEY || null,
    voiceModel: s.voiceModel,
    visionModel: s.visionModel,
  };
}

export type UserPreferences = {
  voiceInput: boolean;
  voiceAnnounce: boolean;
};

// Préférences de dictée, propres à chaque compte. À défaut de ligne
// UserSettings, on retombe sur les colonnes historiques de Settings : les
// réglages d'avant l'arrivée des comptes restent ainsi en vigueur.
export async function getUserPreferences(
  userId: string
): Promise<UserPreferences> {
  const [prefs, legacy] = await Promise.all([
    prisma.userSettings.findUnique({ where: { userId } }),
    prisma.settings.findUnique({ where: { id: 1 } }),
  ]);
  return {
    voiceInput: prefs?.voiceInput ?? legacy?.voiceInput ?? true,
    voiceAnnounce: prefs?.voiceAnnounce ?? legacy?.voiceAnnounce ?? true,
  };
}
