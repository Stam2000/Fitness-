import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSettings } from "@/lib/settings";
import { getHistoricalMaxByName, suggestNextWeight } from "@/lib/progress";
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

  const [settings, historicalMax] = await Promise.all([
    getSettings(),
    getHistoricalMaxByName(session.id),
  ]);

  const suggestions: Record<
    string,
    { lastWeight: number; suggestion: number }
  > = {};
  if (lastCompleted) {
    for (const ex of session.day.exercises) {
      const s = suggestNextWeight(
        lastCompleted.setLogs.filter((l) => l.exerciseId === ex.id),
        ex.reps
      );
      if (s) suggestions[ex.id] = s;
    }
  }

  const maxByExercise: Record<string, number> = {};
  for (const ex of session.day.exercises) {
    if (historicalMax[ex.name] != null)
      maxByExercise[ex.id] = historicalMax[ex.name];
  }

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
      suggestions={suggestions}
      historicalMax={maxByExercise}
      hasOpenrouterKey={Boolean(settings.openrouterApiKey)}
    />
  );
}
