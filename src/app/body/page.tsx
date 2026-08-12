import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import BodyTracker from "@/components/BodyTracker";

export const dynamic = "force-dynamic";

export default async function BodyPage() {
  const user = await requireUser();
  const [measurements, photos, goal] = await Promise.all([
    prisma.bodyMeasurement.findMany({
      where: { userId: user.id },
      orderBy: { date: "asc" },
    }),
    prisma.progressPhoto.findMany({
      where: { userId: user.id },
      orderBy: { date: "desc" },
    }),
    prisma.nutritionGoal.findUnique({ where: { userId: user.id } }),
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
      goal={
        goal && {
          objective: goal.objective,
          activity: goal.activity,
          targetWeightKg: goal.targetWeightKg,
          dailyCalories: goal.dailyCalories,
          dailyProteinG: goal.dailyProteinG,
        }
      }
    />
  );
}
