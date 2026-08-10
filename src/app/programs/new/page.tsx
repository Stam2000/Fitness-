import { prisma } from "@/lib/prisma";
import { getSettings } from "@/lib/settings";
import NewProgramWizard from "@/components/NewProgramWizard";

export const dynamic = "force-dynamic";

export default async function NewProgramPage() {
  const [locations, settings] = await Promise.all([
    prisma.location.findMany({
      orderBy: { createdAt: "asc" },
      include: { _count: { select: { equipment: true } } },
    }),
    getSettings(),
  ]);

  return (
    <main className="flex flex-col gap-4">
      <header className="pt-2">
        <h1 className="text-2xl font-bold">Nouveau programme</h1>
        <p className="text-sm text-muted">
          L&apos;IA crée un programme avec l&apos;équipement de ton contexte.
        </p>
      </header>
      <NewProgramWizard
        locations={locations.map((l) => ({
          id: l.id,
          name: l.name,
          icon: l.icon,
          equipmentCount: l._count.equipment,
        }))}
        hasOpenrouterKey={Boolean(settings.openrouterApiKey)}
        defaultModel={settings.openrouterModel}
        pinnedModels={settings.pinnedModels}
      />
    </main>
  );
}
