import { Sparkles } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getSettings } from "@/lib/settings";
import { requireUser } from "@/lib/session";
import NewProgramWizard from "@/components/NewProgramWizard";

export const dynamic = "force-dynamic";

export default async function NewProgramPage() {
  const user = await requireUser();
  const [locations, settings] = await Promise.all([
    prisma.location.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "asc" },
      include: { _count: { select: { equipment: true } } },
    }),
    getSettings(),
  ]);

  return (
    <main className="flex flex-col gap-4">
      <header className="pt-2">
        <h1 className="flex items-center gap-2 text-2xl font-extrabold italic tracking-tight">
          Créer un programme <Sparkles size={20} className="text-accent" />
        </h1>
        <p className="text-sm text-muted-2">
          L&apos;IA le bâtit avec ton équipement.
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
