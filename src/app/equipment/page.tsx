import { Dumbbell } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getSettings } from "@/lib/settings";
import { requireUser } from "@/lib/session";
import EquipmentManager from "@/components/EquipmentManager";

export const dynamic = "force-dynamic";

export default async function EquipmentPage() {
  const user = await requireUser();
  // Les contextes sont personnels ; le catalogue de matériel reste commun.
  const [locations, equipment, settings] = await Promise.all([
    prisma.location.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "asc" },
      include: { equipment: true },
    }),
    prisma.equipment.findMany({ orderBy: [{ category: "asc" }, { name: "asc" }] }),
    getSettings(),
  ]);

  return (
    <main className="flex flex-col gap-4">
      <header className="pt-2">
        <h1 className="flex items-center gap-2 text-2xl font-extrabold italic tracking-tight">
          <Dumbbell size={20} className="text-accent" /> Matériel
        </h1>
        <p className="text-sm text-muted-2">
          Coche l&apos;équipement dispo dans chaque contexte.
        </p>
      </header>
      <EquipmentManager
        locations={locations.map((l) => ({
          id: l.id,
          name: l.name,
          icon: l.icon,
          equipmentIds: l.equipment.map((e) => e.equipmentId),
        }))}
        equipment={equipment.map((e) => ({
          id: e.id,
          name: e.name,
          category: e.category,
          imageUrl: e.imageUrl,
          imageTaskId: e.imageTaskId,
        }))}
        hasKieKey={Boolean(settings.kieApiKey)}
      />
    </main>
  );
}
