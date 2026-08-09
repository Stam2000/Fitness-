import { prisma } from "@/lib/prisma";
import SettingsForm from "@/components/SettingsForm";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const s = await prisma.settings.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1 },
  });

  return (
    <main className="flex flex-col gap-4">
      <header className="pt-2">
        <h1 className="text-2xl font-bold">Réglages</h1>
        <p className="text-sm text-muted">
          Clés API, modèle d&apos;IA et options vocales.
        </p>
      </header>
      <SettingsForm
        initial={{
          hasOpenrouterKey:
            Boolean(s.openrouterApiKey) ||
            Boolean(process.env.OPENROUTER_API_KEY),
          hasKieKey: Boolean(s.kieApiKey) || Boolean(process.env.KIE_API_KEY),
          openrouterModel: s.openrouterModel,
          voiceInput: s.voiceInput,
          voiceAnnounce: s.voiceAnnounce,
        }}
      />
    </main>
  );
}
