import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * Versionnage du programme et plan figé des séances.
 *
 * Deux enregistrements, une même forme de données :
 *
 * - `ProgramVersion.snapshot` — le plan complet après chaque modification.
 *   Sert à consulter et à restaurer un état antérieur.
 * - `WorkoutSession.planSnapshot` — le jour travaillé, tel que prescrit au
 *   moment de la séance. C'est LUI qui protège l'historique : la page de suivi
 *   le lit au lieu du programme vivant, si bien qu'éditer un programme ne
 *   réécrit plus le passé.
 *
 * Les deux sont du JSON dénormalisé, volontairement : un snapshot doit rester
 * lisible même si les lignes dont il est issu ont disparu.
 */

export type SnapshotVariation = {
  id: string;
  name: string;
  sets: number;
  reps: string;
  restSeconds: number;
  weightHint: string | null;
  equipment: string[];
  muscles: string[];
  targetSeconds: number | null;
  setSeconds: number | null;
  notes: string | null;
  imageUrl: string | null;
  videoUrl: string | null;
};

export type SnapshotExercise = {
  id: string;
  order: number;
  name: string;
  sets: number;
  reps: string;
  restSeconds: number;
  weightHint: string | null;
  equipment: string[];
  muscles: string[];
  targetSeconds: number | null;
  setSeconds: number | null;
  transitionSeconds: number | null;
  notes: string | null;
  imageUrl: string | null;
  videoUrl: string | null;
  variations: SnapshotVariation[];
};

export type SnapshotDay = {
  id: string;
  name: string;
  focus: string | null;
  exercises: SnapshotExercise[];
};

export type ProgramSnapshot = {
  name: string;
  description: string | null;
  days: SnapshotDay[];
};

export type SessionPlan = {
  programId: string | null;
  programName: string;
  dayId: string | null;
  dayName: string;
  dayFocus: string | null;
  exercises: SnapshotExercise[];
};

/** Origine d'une version, telle que stockée dans `ProgramVersion.source`. */
export type VersionSource = "creation" | "edit" | "ai" | "restore";

export const VERSION_SOURCE_LABELS: Record<VersionSource, string> = {
  creation: "Création",
  edit: "Modification",
  ai: "Retouche IA",
  restore: "Restauration",
};

// Un `tx` de transaction expose les mêmes modèles que le client : les
// helpers ci-dessous acceptent les deux pour pouvoir être appelés à
// l'intérieur d'un `$transaction` comme à l'extérieur.
type Db = Prisma.TransactionClient | typeof prisma;

// ---------------------------------------------------------------------------
// Construction des snapshots
// ---------------------------------------------------------------------------

// Forme minimale attendue d'une ligne Exercise/ExerciseVariation : les
// appelants passent leurs objets Prisma tels quels.
type VariationRow = Omit<SnapshotVariation, never>;
type ExerciseRow = Omit<SnapshotExercise, "variations"> & {
  variations?: VariationRow[];
};

export function toSnapshotExercises(rows: ExerciseRow[]): SnapshotExercise[] {
  return rows.map((ex) => ({
    id: ex.id,
    order: ex.order,
    name: ex.name,
    sets: ex.sets,
    reps: ex.reps,
    restSeconds: ex.restSeconds,
    weightHint: ex.weightHint,
    equipment: ex.equipment,
    muscles: ex.muscles,
    targetSeconds: ex.targetSeconds,
    setSeconds: ex.setSeconds,
    transitionSeconds: ex.transitionSeconds,
    notes: ex.notes,
    imageUrl: ex.imageUrl,
    videoUrl: ex.videoUrl,
    variations: (ex.variations ?? []).map((v) => ({
      id: v.id,
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
  }));
}

/** Plan complet d'un programme dans son état actuel. */
export async function buildProgramSnapshot(
  db: Db,
  programId: string
): Promise<ProgramSnapshot | null> {
  const program = await db.program.findUnique({
    where: { id: programId },
    include: {
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
  });
  if (!program) return null;
  return {
    name: program.name,
    description: program.description,
    days: program.days.map((day) => ({
      id: day.id,
      name: day.name,
      focus: day.focus,
      exercises: toSnapshotExercises(day.exercises),
    })),
  };
}

/** Plan d'un jour dans son état actuel, pour figer une séance. */
export async function buildSessionPlan(
  db: Db,
  dayId: string
): Promise<SessionPlan | null> {
  const day = await db.programDay.findUnique({
    where: { id: dayId },
    include: {
      program: { select: { id: true, name: true } },
      exercises: {
        orderBy: { order: "asc" },
        include: { variations: { orderBy: { order: "asc" } } },
      },
    },
  });
  if (!day) return null;
  return {
    programId: day.program.id,
    programName: day.program.name,
    dayId: day.id,
    dayName: day.name,
    dayFocus: day.focus,
    exercises: toSnapshotExercises(day.exercises),
  };
}

// ---------------------------------------------------------------------------
// Relecture
// ---------------------------------------------------------------------------

// Les colonnes JSON sont typées `JsonValue` par Prisma : rien ne garantit au
// compilateur qu'elles ont la forme attendue. Ces deux fonctions font le
// contrôle minimal qui évite un plantage sur une valeur ancienne ou tronquée.

export function parseProgramSnapshot(raw: unknown): ProgramSnapshot | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const value = raw as Partial<ProgramSnapshot>;
  if (typeof value.name !== "string" || !Array.isArray(value.days)) return null;
  return {
    name: value.name,
    description: typeof value.description === "string" ? value.description : null,
    days: value.days,
  };
}

export function parseSessionPlan(raw: unknown): SessionPlan | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const value = raw as Partial<SessionPlan>;
  if (typeof value.dayName !== "string" || !Array.isArray(value.exercises)) {
    return null;
  }
  return {
    programId: typeof value.programId === "string" ? value.programId : null,
    programName:
      typeof value.programName === "string" ? value.programName : "Programme",
    dayId: typeof value.dayId === "string" ? value.dayId : null,
    dayName: value.dayName,
    dayFocus: typeof value.dayFocus === "string" ? value.dayFocus : null,
    exercises: value.exercises,
  };
}

/**
 * Comment nommer une séance : son plan figé fait foi, le jour vivant ne sert
 * que de repli (séance en cours, ou antérieure à la migration). Un jour
 * supprimé depuis n'empêche donc plus d'afficher la séance.
 */
export function describeSessionPlan(session: {
  planSnapshot: unknown;
  day?: {
    name: string;
    focus: string | null;
    program: { name: string };
  } | null;
}): { programName: string; dayName: string; dayFocus: string | null } {
  const plan = parseSessionPlan(session.planSnapshot);
  if (plan) {
    return {
      programName: plan.programName,
      dayName: plan.dayName,
      dayFocus: plan.dayFocus,
    };
  }
  if (session.day) {
    return {
      programName: session.day.program.name,
      dayName: session.day.name,
      dayFocus: session.day.focus,
    };
  }
  return {
    programName: "Programme supprimé",
    dayName: "Séance",
    dayFocus: null,
  };
}

/**
 * Exercices prescrits pour une séance : le plan figé d'abord, le jour vivant
 * en repli (séance en cours, ou antérieure à la migration).
 */
export function sessionPlanExercises(session: {
  planSnapshot: unknown;
  day?: { exercises: ExerciseRow[] } | null;
}): SnapshotExercise[] {
  const plan = parseSessionPlan(session.planSnapshot);
  if (plan) return plan.exercises;
  return session.day ? toSnapshotExercises(session.day.exercises) : [];
}

/**
 * Nom à figer dans `SetLog.exerciseName` au moment d'enregistrer une série.
 *
 * Le jour vivant fait foi — une série se saisit pendant la séance — et le plan
 * figé prend le relais pour une correction après coup portant sur un exercice
 * retiré du programme depuis. Renvoyer null vaut refus : l'exercice visé
 * n'appartient pas à cette séance (ou la séance n'est pas celle de l'appelant),
 * ce qui est le seul contrôle de propriété nécessaire depuis que `exerciseId`
 * n'est plus une clé étrangère.
 */
export async function loggedExerciseName(
  db: Db,
  sessionId: string,
  userId: string,
  exerciseId: string
): Promise<string | null> {
  const session = await db.workoutSession.findFirst({
    where: { id: sessionId, userId },
    select: {
      planSnapshot: true,
      day: { select: { exercises: { select: { id: true, name: true } } } },
    },
  });
  if (!session) return null;
  const live = session.day?.exercises.find((e) => e.id === exerciseId);
  if (live) return live.name;
  const plan = parseSessionPlan(session.planSnapshot);
  return plan?.exercises.find((e) => e.id === exerciseId)?.name ?? null;
}

// ---------------------------------------------------------------------------
// Enregistrement d'une version
// ---------------------------------------------------------------------------

// Champs qui définissent le plan. Ce qui relève de l'enrichissement — image,
// vidéo, muscles et temps cibles annotés après coup par l'IA — en est exclu :
// deux snapshots qui n'en diffèrent que par là décrivent le même programme et
// ne méritent pas une version de plus.
function planFingerprint(snapshot: ProgramSnapshot): string {
  return JSON.stringify({
    name: snapshot.name,
    description: snapshot.description,
    days: snapshot.days.map((d) => ({
      name: d.name,
      focus: d.focus,
      exercises: d.exercises.map((e) => ({
        id: e.id,
        name: e.name,
        sets: e.sets,
        reps: e.reps,
        rest: e.restSeconds,
        hint: e.weightHint,
        equipment: e.equipment,
        notes: e.notes,
        variations: e.variations.map((v) => ({
          name: v.name,
          sets: v.sets,
          reps: v.reps,
          rest: v.restSeconds,
        })),
      })),
    })),
  });
}

/**
 * Fige l'état courant du programme si le plan a changé depuis la dernière
 * version. Renvoie la version écrite, ou null si rien n'a bougé.
 *
 * À appeler APRÈS la modification : une version décrit un état atteint, pas
 * une intention. La toute première version d'un programme est donc son état à
 * la création.
 */
export async function recordProgramVersion(
  programId: string,
  source: VersionSource,
  note?: string | null
): Promise<{ id: string; versionNumber: number } | null> {
  const snapshot = await buildProgramSnapshot(prisma, programId);
  if (!snapshot) return null;

  const latest = await prisma.programVersion.findFirst({
    where: { programId },
    orderBy: { versionNumber: "desc" },
    select: { versionNumber: true, snapshot: true },
  });
  if (latest) {
    const previous = parseProgramSnapshot(latest.snapshot);
    if (previous && planFingerprint(previous) === planFingerprint(snapshot)) {
      return null;
    }
  }

  // Course possible entre deux enregistrements simultanés sur le même
  // programme : la contrainte unique (programId, versionNumber) tranche, et on
  // considère que la version concurrente fait le travail.
  try {
    const created = await prisma.programVersion.create({
      data: {
        programId,
        versionNumber: (latest?.versionNumber ?? 0) + 1,
        source,
        note: note ?? null,
        snapshot: snapshot as unknown as Prisma.InputJsonValue,
      },
      select: { id: true, versionNumber: true },
    });
    return created;
  } catch {
    return null;
  }
}

/** Même chose, quand on ne tient que l'exercice modifié. */
export async function recordProgramVersionForExercise(
  exerciseId: string,
  source: VersionSource,
  note?: string | null
) {
  const exercise = await prisma.exercise.findUnique({
    where: { id: exerciseId },
    select: { day: { select: { programId: true } } },
  });
  if (!exercise) return null;
  return recordProgramVersion(exercise.day.programId, source, note);
}

/** Dernière version connue d'un programme (pour étiqueter une séance). */
export async function latestVersionId(
  programId: string
): Promise<string | null> {
  const latest = await prisma.programVersion.findFirst({
    where: { programId },
    orderBy: { versionNumber: "desc" },
    select: { id: true },
  });
  return latest?.id ?? null;
}

// ---------------------------------------------------------------------------
// Comparaison de deux versions
// ---------------------------------------------------------------------------

export type SnapshotDiff = {
  daysAdded: string[];
  daysRemoved: string[];
  exercisesAdded: string[];
  exercisesRemoved: string[];
  exercisesChanged: { name: string; changes: string[] }[];
  renamed: boolean;
};

function exerciseLine(ex: SnapshotExercise): string {
  return `${ex.sets} × ${ex.reps}, repos ${ex.restSeconds} s`;
}

/**
 * Ce qui a changé entre deux plans. Les exercices sont appariés par id — c'est
 * ainsi qu'on distingue « renommé » (même id, autre nom) de « retiré puis
 * ajouté ».
 */
export function diffSnapshots(
  before: ProgramSnapshot,
  after: ProgramSnapshot
): SnapshotDiff {
  const beforeDays = new Map(before.days.map((d) => [d.id, d]));
  const afterDays = new Map(after.days.map((d) => [d.id, d]));
  const beforeEx = new Map(
    before.days.flatMap((d) => d.exercises.map((e) => [e.id, e] as const))
  );
  const afterEx = new Map(
    after.days.flatMap((d) => d.exercises.map((e) => [e.id, e] as const))
  );

  const diff: SnapshotDiff = {
    daysAdded: after.days.filter((d) => !beforeDays.has(d.id)).map((d) => d.name),
    daysRemoved: before.days.filter((d) => !afterDays.has(d.id)).map((d) => d.name),
    exercisesAdded: [],
    exercisesRemoved: [],
    exercisesChanged: [],
    renamed: before.name !== after.name,
  };

  for (const [id, ex] of afterEx) {
    if (!beforeEx.has(id)) {
      diff.exercisesAdded.push(ex.name);
      continue;
    }
    const old = beforeEx.get(id)!;
    const changes: string[] = [];
    if (old.name !== ex.name) changes.push(`renommé « ${old.name} »`);
    if (
      old.sets !== ex.sets ||
      old.reps !== ex.reps ||
      old.restSeconds !== ex.restSeconds
    ) {
      changes.push(`${exerciseLine(old)} → ${exerciseLine(ex)}`);
    }
    if ((old.weightHint ?? "") !== (ex.weightHint ?? "")) {
      changes.push(`charge : ${ex.weightHint || "libre"}`);
    }
    if (old.variations.length !== ex.variations.length) {
      changes.push(`${ex.variations.length} variante(s)`);
    }
    if (changes.length > 0) diff.exercisesChanged.push({ name: ex.name, changes });
  }

  for (const [id, ex] of beforeEx) {
    if (!afterEx.has(id)) diff.exercisesRemoved.push(ex.name);
  }

  return diff;
}

function count(n: number, noun: string, participle: string): string {
  const s = n > 1 ? "s" : "";
  return `${n} ${noun}${s} ${participle}${s}`;
}

/** Résumé d'une ligne, pour la liste des versions. */
export function summarizeDiff(diff: SnapshotDiff): string {
  const parts: string[] = [];
  if (diff.renamed) parts.push("programme renommé");
  if (diff.daysAdded.length > 0)
    parts.push(count(diff.daysAdded.length, "jour", "ajouté"));
  if (diff.daysRemoved.length > 0)
    parts.push(count(diff.daysRemoved.length, "jour", "retiré"));
  if (diff.exercisesAdded.length > 0)
    parts.push(count(diff.exercisesAdded.length, "exercice", "ajouté"));
  if (diff.exercisesRemoved.length > 0)
    parts.push(count(diff.exercisesRemoved.length, "exercice", "retiré"));
  if (diff.exercisesChanged.length > 0)
    parts.push(count(diff.exercisesChanged.length, "exercice", "modifié"));
  if (parts.length === 0) return "Aucun changement de plan";
  return parts.join(", ");
}
