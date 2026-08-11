import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSettings } from "@/lib/settings";
import { getHistoricalMaxByName, suggestNextWeight } from "@/lib/progress";
import { activeVariationIndex } from "@/lib/variants";
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
          exercises: {
            orderBy: { order: "asc" },
            include: { variations: { orderBy: { order: "asc" } } },
          },
        },
      },
    },
  });
  if (!session) notFound();

  // Dernières séances terminées sur ce jour : sert à retrouver, pour chaque
  // option (base ou variante), la dernière fois où elle a été exécutée.
  const recentCompleted = await prisma.workoutSession.findMany({
    where: {
      dayId: session.dayId,
      completedAt: { not: null },
      id: { not: session.id },
    },
    orderBy: { completedAt: "desc" },
    take: 10,
    include: { setLogs: true },
  });

  const [settings, historicalMax] = await Promise.all([
    getSettings(),
    getHistoricalMaxByName(session.id),
  ]);

  const exercises = session.day.exercises.map((ex) => {
    const options = [
      {
        name: ex.name,
        sets: ex.sets,
        reps: ex.reps,
        restSeconds: ex.restSeconds,
        weightHint: ex.weightHint,
        equipment: ex.equipment,
        muscles: ex.muscles,
        notes: ex.notes,
        imageUrl: ex.imageUrl,
        videoUrl: ex.videoUrl,
      },
      ...ex.variations.map((v) => ({
        name: v.name,
        sets: v.sets,
        reps: v.reps,
        restSeconds: v.restSeconds,
        weightHint: v.weightHint,
        equipment: v.equipment,
        muscles: v.muscles,
        notes: v.notes,
        imageUrl: v.imageUrl,
        videoUrl: v.videoUrl,
      })),
    ].map((o, oi) => {
      // Une variante est identifiée dans les logs par son nom ; null = base.
      const variationName = oi === 0 ? null : o.name;
      const lastSession = recentCompleted.find((s) =>
        s.setLogs.some(
          (l) =>
            l.exerciseId === ex.id &&
            (l.variationName ?? null) === variationName &&
            l.done
        )
      );
      const lastLogs = (lastSession?.setLogs ?? []).filter(
        (l) =>
          l.exerciseId === ex.id &&
          (l.variationName ?? null) === variationName
      );
      return {
        ...o,
        suggestion: lastLogs.length > 0 ? suggestNextWeight(lastLogs, o.reps) : null,
        previousLogs: lastLogs.map((l) => ({
          setIndex: l.setIndex,
          reps: l.reps,
          weightKg: l.weightKg,
        })),
        historicalMax: historicalMax[o.name] ?? null,
      };
    });

    // Rotation automatique : le n° de passage choisit l'option, sauf choix
    // manuel persisté ; clamp au cas où les variantes auraient changé.
    const autoIndex =
      options.length > 1 ? session.cycleIndex % options.length : 0;
    const activeIndex = activeVariationIndex(session, ex);
    return { id: ex.id, options, activeIndex, autoIndex };
  });

  return (
    <WorkoutPlayer
      sessionId={session.id}
      programName={session.day.program.name}
      dayName={session.day.name}
      completed={Boolean(session.completedAt)}
      exercises={exercises}
      initialLogs={session.setLogs.map((l) => ({
        exerciseId: l.exerciseId,
        setIndex: l.setIndex,
        reps: l.reps,
        weightKg: l.weightKg,
        done: l.done,
      }))}
      voiceInput={settings.voiceInput}
      voiceAnnounce={settings.voiceAnnounce}
      hasOpenrouterKey={Boolean(settings.openrouterApiKey)}
      startedAtMs={session.startedAt.getTime()}
      completedAtMs={session.completedAt?.getTime() ?? null}
      initialExerciseSeconds={
        session.exerciseSeconds &&
        typeof session.exerciseSeconds === "object" &&
        !Array.isArray(session.exerciseSeconds)
          ? (session.exerciseSeconds as Record<string, number>)
          : {}
      }
    />
  );
}
