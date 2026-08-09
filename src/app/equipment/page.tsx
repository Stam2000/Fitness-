import { prisma } from "@/lib/prisma";
import EquipmentManager from "@/components/EquipmentManager";

export const dynamic = "force-dynamic";

export default async function EquipmentPage() {
  const [locations, equipment] = await Promise.all([
    prisma.location.findMany({
      orderBy: { createdAt: "asc" },
      include: { equipment: true },
    }),
    prisma.equipment.findMany({ orderBy: [{ category: "asc" }, { name: "asc" }] }),
  ]);

  return (
    <main className="flex flex-col gap-4">
      <header className="pt-2">
        <h1 className="text-2xl font-bold">Mon matériel</h1>
        <p className="text-sm text-muted">
          Coche l&apos;équipement disponible dans chaque contexte
          d&apos;entraînement.
        </p>
      </header>
      <EquipmentManager
        locations={locations.map((l) => ({
          id: l.id,
          name: l.name,
          icon: l.icon,
          equipmentIds: l.equipment.map((e) => e.equipmentId),
        }))}
        equipment={equipment}
      />
    </main>
  );
}
