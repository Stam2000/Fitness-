import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSettings } from "@/lib/settings";
import {
  getHistoricalMaxByName,
  getLastLogsByName,
  suggestNextWeight,
} from "@/lib/progress";
import { activeVariationIndex } from "@/lib/variants";
import { normalizeName } from "@/lib/normalize";
import WorkoutPlayer from "@/components/WorkoutPlayer";
import type {
  MuscleChipInfo,
  MuscleComboInfo,
} from "@/components/MusclePreviewSheet";

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

  // Noms de tous les mouvements (base + variantes) : sert au repli par nom
  // quand ce jour n'a pas encore d'historique (ex. début d'un nouveau bloc).
  const optionNames = session.day.exercises.flatMap((ex) => [
    ex.name,
    ...ex.variations.map((v) => v.name),
  ]);

  const [settings, historicalMax, lastLogsByName, allMuscles, allCombos] =
    await Promise.all([
      getSettings(),
      getHistoricalMaxByName(session.id),
      getLastLogsByName(optionNames, session.id),
      prisma.muscle.findMany({
        select: { id: true, name: true, imageUrl: true, imageTaskId: true },
      }),
      prisma.muscleCombo.findMany({
        select: {
          id: true,
          key: true,
          muscles: true,
          imageUrl: true,
          imageTaskId: true,
        },
      }),
    ]);

  // Catalogue Muscle indexé par nom normalisé : le popup de prévisualisation
  // retrouve l'image d'un muscle à partir du nom porté par l'exercice.
  const muscleInfoByName: Record<string, MuscleChipInfo> = Object.fromEntries(
    allMuscles.map((m) => [normalizeName(m.name), m])
  );
  // Combinaisons de muscles indexées par leur clé canonique.
  const muscleComboByKey: Record<string, MuscleComboInfo> = Object.fromEntries(
    allCombos.map((c) => [c.key, c])
  );

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
        targetSeconds: ex.targetSeconds,
        setSeconds: ex.setSeconds,
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
        targetSeconds: v.targetSeconds,
        setSeconds: v.setSeconds,
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
      const dayLogs = (lastSession?.setLogs ?? []).filter(
        (l) =>
          l.exerciseId === ex.id &&
          (l.variationName ?? null) === variationName
      );
      // Pas d'historique sur ce jour → repli sur la dernière séance (tous
      // programmes confondus) où ce mouvement a été joué, retrouvée par nom.
      const lastLogs = dayLogs.length > 0 ? dayLogs : lastLogsByName[o.name] ?? [];
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
    return {
      id: ex.id,
      options,
      activeIndex,
      autoIndex,
      transitionSeconds: ex.transitionSeconds,
    };
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
      muscleInfoByName={muscleInfoByName}
      muscleComboByKey={muscleComboByKey}
    />
  );
}
