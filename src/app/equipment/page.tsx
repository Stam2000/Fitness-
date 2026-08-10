import { prisma } from "@/lib/prisma";
import { getSettings } from "@/lib/settings";
import EquipmentManager from "@/components/EquipmentManager";

export const dynamic = "force-dynamic";

export default async function EquipmentPage() {
  const [locations, equipment, settings] = await Promise.all([
    prisma.location.findMany({
      orderBy: { createdAt: "asc" },
      include: { equipment: true },
    }),
    prisma.equipment.findMany({ orderBy: [{ category: "asc" }, { name: "asc" }] }),
    getSettings(),
  ]);

  return (
    <main className="flex flex-col gap-4">
      <header className="pt-2">
        <h1 className="text-2xl font-extrabold italic tracking-tight">
          Matériel 🏋️
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
