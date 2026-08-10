import { prisma } from "@/lib/prisma";

export type ResolvedSettings = {
  openrouterApiKey: string | null;
  openrouterModel: string;
  pinnedModels: string[];
  kieApiKey: string | null;
  voiceInput: boolean;
  voiceAnnounce: boolean;
};

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
    voiceInput: s.voiceInput,
    voiceAnnounce: s.voiceAnnounce,
  };
}
