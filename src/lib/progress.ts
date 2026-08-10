import { prisma } from "@/lib/prisma";

export type SessionPoint = {
  date: string; // ISO
  topWeight: number | null;
  topReps: number | null; // reps réalisées à topWeight (ou max reps si pas de poids)
  volume: number;
};

export type ExerciseProgress = {
  name: string;
  points: SessionPoint[];
  prWeight: number | null;
  prReps: number | null; // pour les exercices au poids du corps
  metric: "weight" | "reps";
};

// « 8-12 » → 12, « 10 » → 10, « 12/jambe » → 12 ; « max », « 30 s » → null
export function parseTopReps(reps: string): number | null {
  const match = reps.match(/^(\d+)(?:\s*-\s*(\d+))?(?:\s*\/.*)?$/);
  if (!match) return null;
  return match[2] ? parseInt(match[2], 10) : parseInt(match[1], 10);
}

// Surcharge progressive simple : objectif haut de fourchette atteint sur
// toutes les séries → +2,5 kg, sinon on consolide la même charge.
export function suggestNextWeight(
  lastLogs: { weightKg: number | null; reps: number | null; done: boolean }[],
  targetReps: string
): { lastWeight: number; suggestion: number } | null {
  const done = lastLogs.filter((l) => l.done && l.weightKg != null);
  if (done.length === 0) return null;
  const lastWeight = Math.max(...done.map((l) => l.weightKg!));
  const top = parseTopReps(targetReps);
  const allAtTop =
    top !== null && done.every((l) => l.reps != null && l.reps >= top);
  return {
    lastWeight,
    suggestion: allAtTop ? Math.round((lastWeight + 2.5) * 2) / 2 : lastWeight,
  };
}

// Progression par exercice (regroupé par nom, tous programmes confondus).
export async function getExerciseProgress(): Promise<ExerciseProgress[]> {
  const sessions = await prisma.workoutSession.findMany({
    where: { completedAt: { not: null } },
    orderBy: { completedAt: "asc" },
    include: {
      setLogs: { where: { done: true }, include: { exercise: true } },
    },
  });

  const byExercise = new Map<string, SessionPoint[]>();
  for (const session of sessions) {
    const byName = new Map<string, typeof session.setLogs>();
    for (const log of session.setLogs) {
      // Une variante est suivie sous son propre nom (mouvement différent).
      const name = log.variationName ?? log.exercise.name;
      if (!byName.has(name)) byName.set(name, []);
      byName.get(name)!.push(log);
    }
    for (const [name, logs] of byName) {
      const weights = logs.filter((l) => l.weightKg != null);
      const topWeight =
        weights.length > 0
          ? Math.max(...weights.map((l) => l.weightKg!))
          : null;
      const topLog =
        topWeight !== null
          ? weights
              .filter((l) => l.weightKg === topWeight)
              .sort((a, b) => (b.reps ?? 0) - (a.reps ?? 0))[0]
          : null;
      const maxReps = logs.reduce(
        (acc, l) => Math.max(acc, l.reps ?? 0),
        0
      );
      const volume = logs.reduce(
        (acc, l) => acc + (l.weightKg ?? 0) * (l.reps ?? 0),
        0
      );
      if (!byExercise.has(name)) byExercise.set(name, []);
      byExercise.get(name)!.push({
        date: session.completedAt!.toISOString(),
        topWeight,
        topReps: topLog ? (topLog.reps ?? null) : maxReps > 0 ? maxReps : null,
        volume,
      });
    }
  }

  const result: ExerciseProgress[] = [];
  for (const [name, points] of byExercise) {
    const weighted = points.filter((p) => p.topWeight != null);
    const metric: "weight" | "reps" = weighted.length > 0 ? "weight" : "reps";
    const prWeight =
      weighted.length > 0
        ? Math.max(...weighted.map((p) => p.topWeight!))
        : null;
    const repsPoints = points.filter((p) => p.topReps != null);
    const prReps =
      repsPoints.length > 0
        ? Math.max(...repsPoints.map((p) => p.topReps!))
        : null;
    result.push({ name, points, prWeight, prReps, metric });
  }

  // Les exercices les plus pratiqués d'abord.
  result.sort((a, b) => b.points.length - a.points.length);
  return result;
}

// Poids max historique par nom d'exercice (pour détecter les PR d'une séance).
export async function getHistoricalMaxByName(
  excludeSessionId?: string
): Promise<Record<string, number>> {
  const logs = await prisma.setLog.findMany({
    where: {
      done: true,
      weightKg: { not: null },
      session: {
        completedAt: { not: null },
        ...(excludeSessionId ? { id: { not: excludeSessionId } } : {}),
      },
    },
    include: { exercise: { select: { name: true } } },
  });
  const max: Record<string, number> = {};
  for (const log of logs) {
    const name = log.variationName ?? log.exercise.name;
    if (log.weightKg! > (max[name] ?? 0)) max[name] = log.weightKg!;
  }
  return max;
}
