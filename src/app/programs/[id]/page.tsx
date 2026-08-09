import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSettings } from "@/lib/settings";
import ProgramDetail from "@/components/ProgramDetail";

export const dynamic = "force-dynamic";

export default async function ProgramPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [program, locations, settings] = await Promise.all([
    prisma.program.findUnique({
      where: { id },
      include: {
        location: true,
        days: {
          orderBy: { dayIndex: "asc" },
          include: { exercises: { orderBy: { order: "asc" } } },
        },
      },
    }),
    prisma.location.findMany({ orderBy: { createdAt: "asc" } }),
    getSettings(),
  ]);
  if (!program) notFound();

  return (
    <ProgramDetail
      locations={locations.map((l) => ({
        id: l.id,
        name: l.name,
        icon: l.icon,
      }))}
      hasOpenrouterKey={Boolean(settings.openrouterApiKey)}
      program={{
        id: program.id,
        name: program.name,
        description: program.description,
        goal: program.goal,
        level: program.level,
        locationLabel: program.location
          ? `${program.location.icon ?? ""} ${program.location.name}`.trim()
          : null,
        days: program.days.map((d) => ({
          id: d.id,
          name: d.name,
          focus: d.focus,
          exercises: d.exercises.map((ex) => ({
            id: ex.id,
            name: ex.name,
            sets: ex.sets,
            reps: ex.reps,
            restSeconds: ex.restSeconds,
            weightHint: ex.weightHint,
            equipment: ex.equipment,
            notes: ex.notes,
            imageUrl: ex.imageUrl,
            imageTaskId: ex.imageTaskId,
          })),
        })),
      }}
    />
  );
}
