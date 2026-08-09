import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSettings } from "@/lib/settings";
import WorkoutPlayer from "@/components/WorkoutPlayer";

export const dynamic = "force-dynamic";

export default async function WorkoutPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  const session = await prisma.workoutSession.findUnique({
    where: { id: sessionId },
    include: {
      setLogs: true,
      day: {
        include: {
          program: true,
          exercises: { orderBy: { order: "asc" } },
        },
      },
    },
  });
  if (!session) notFound();

  // Dernières perfs sur ce jour pour pré-remplir poids/reps.
  const lastCompleted = await prisma.workoutSession.findFirst({
    where: { dayId: session.dayId, completedAt: { not: null } },
    orderBy: { completedAt: "desc" },
    include: { setLogs: true },
  });

  const settings = await getSettings();

  return (
    <WorkoutPlayer
      sessionId={session.id}
      programName={session.day.program.name}
      dayName={session.day.name}
      completed={Boolean(session.completedAt)}
      exercises={session.day.exercises.map((ex) => ({
        id: ex.id,
        name: ex.name,
        sets: ex.sets,
        reps: ex.reps,
        restSeconds: ex.restSeconds,
        weightHint: ex.weightHint,
        equipment: ex.equipment,
        notes: ex.notes,
        imageUrl: ex.imageUrl,
      }))}
      initialLogs={session.setLogs.map((l) => ({
        exerciseId: l.exerciseId,
        setIndex: l.setIndex,
        reps: l.reps,
        weightKg: l.weightKg,
        done: l.done,
      }))}
      previousLogs={(lastCompleted?.setLogs ?? []).map((l) => ({
        exerciseId: l.exerciseId,
        setIndex: l.setIndex,
        reps: l.reps,
        weightKg: l.weightKg,
        done: l.done,
      }))}
      voiceInput={settings.voiceInput}
      voiceAnnounce={settings.voiceAnnounce}
    />
  );
}
