import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSettings } from "@/lib/settings";
import { getCompletedCycles } from "@/lib/progress";
import ProgramDetail from "@/components/ProgramDetail";

export const dynamic = "force-dynamic";

export default async function ProgramPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [program, locations, settings, completedCycles] = await Promise.all([
    prisma.program.findUnique({
      where: { id },
      include: {
        location: true,
        nextProgram: { select: { id: true, name: true } },
        days: {
          orderBy: { dayIndex: "asc" },
          include: {
            exercises: {
              orderBy: { order: "asc" },
              include: { variations: { orderBy: { order: "asc" } } },
            },
          },
        },
      },
    }),
    prisma.location.findMany({ orderBy: { createdAt: "asc" } }),
    getSettings(),
    getCompletedCycles(id),
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
        blockCycles: program.blockCycles,
        blockNumber: program.blockNumber,
        archived: Boolean(program.archivedAt),
        nextProgram: program.nextProgram
          ? { id: program.nextProgram.id, name: program.nextProgram.name }
          : null,
        completedCycles,
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
            muscles: ex.muscles,
            targetSeconds: ex.targetSeconds,
            transitionSeconds: ex.transitionSeconds,
            notes: ex.notes,
            imageUrl: ex.imageUrl,
            imageTaskId: ex.imageTaskId,
            videoUrl: ex.videoUrl,
            videoTaskId: ex.videoTaskId,
            variations: ex.variations.map((v) => ({
              id: v.id,
              name: v.name,
              sets: v.sets,
              reps: v.reps,
              restSeconds: v.restSeconds,
              weightHint: v.weightHint,
              equipment: v.equipment,
              muscles: v.muscles,
              targetSeconds: v.targetSeconds,
              notes: v.notes,
              imageUrl: v.imageUrl,
              imageTaskId: v.imageTaskId,
              videoUrl: v.videoUrl,
              videoTaskId: v.videoTaskId,
            })),
          })),
        })),
      }}
    />
  );
}
