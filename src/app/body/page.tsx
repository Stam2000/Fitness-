import { prisma } from "@/lib/prisma";
import BodyTracker from "@/components/BodyTracker";

export const dynamic = "force-dynamic";

export default async function BodyPage() {
  const [measurements, photos] = await Promise.all([
    prisma.bodyMeasurement.findMany({ orderBy: { date: "asc" } }),
    prisma.progressPhoto.findMany({ orderBy: { date: "desc" } }),
  ]);

  return (
    <BodyTracker
      measurements={measurements.map((m) => ({
        id: m.id,
        dateIso: m.date.toISOString(),
        weightKg: m.weightKg,
        muscleMassKg: m.muscleMassKg,
        bodyFatPct: m.bodyFatPct,
        notes: m.notes,
      }))}
      photos={photos.map((p) => ({
        id: p.id,
        dateIso: p.date.toISOString(),
        imageUrl: p.imageUrl,
        note: p.note,
      }))}
    />
  );
}
