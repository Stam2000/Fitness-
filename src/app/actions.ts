"use server";

import { prisma } from "@/lib/prisma";
import { programDraftSchema, type ProgramDraft } from "@/lib/program-schema";
import {
  ensureMuscleCombosExist,
  ensureMusclesExist,
  getKnownMuscles,
  resolveDraftMuscles,
  resolveMuscleNames,
} from "@/lib/known-muscles";
import { deleteLocalMedia } from "@/lib/media-store";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

// ---------- Contextes & équipement ----------

// Renvoie l'id du contexte créé pour que l'interface puisse le sélectionner
// aussitôt (sans quoi la création passe inaperçue).
export async function createLocation(
  name: string,
  icon: string
): Promise<string | null> {
  if (!name.trim()) return null;
  const location = await prisma.location.create({
    data: { name: name.trim(), icon },
  });
  revalidatePath("/equipment");
  revalidatePath("/programs/new");
  revalidatePath("/");
  return location.id;
}

export async function updateLocation(id: string, name: string, icon: string) {
  if (!name.trim()) return;
  await prisma.location.update({
    where: { id },
    data: { name: name.trim(), icon },
  });
  revalidatePath("/equipment");
  revalidatePath("/");
}

export async function deleteLocation(id: string) {
  await prisma.location.delete({ where: { id } });
  revalidatePath("/equipment");
  revalidatePath("/");
}

export async function toggleLocationEquipment(
  locationId: string,
  equipmentId: string,
  enabled: boolean
) {
  if (enabled) {
    await prisma.locationEquipment.upsert({
      where: { locationId_equipmentId: { locationId, equipmentId } },
      update: {},
      create: { locationId, equipmentId },
    });
  } else {
    await prisma.locationEquipment.deleteMany({
      where: { locationId, equipmentId },
    });
  }
  revalidatePath("/equipment");
}

export async function createEquipment(name: string, category: string) {
  if (!name.trim()) return;
  await prisma.equipment.upsert({
    where: { name: name.trim() },
    update: {},
    create: { name: name.trim(), category: category || "Accessoires" },
  });
  revalidatePath("/equipment");
}

// ---------- Réglages ----------

export async function saveSettings(data: {
  openrouterApiKey?: string;
  openrouterModel?: string;
  kieApiKey?: string;
  voiceInput?: boolean;
  voiceAnnounce?: boolean;
  voiceModel?: string;
}) {
  const update: Record<string, string | boolean | null> = {};
  // Champ vide = ne pas changer ; "-" seul = effacer la clé.
  if (data.openrouterApiKey !== undefined && data.openrouterApiKey !== "") {
    update.openrouterApiKey =
      data.openrouterApiKey === "-" ? null : data.openrouterApiKey.trim();
  }
  if (data.kieApiKey !== undefined && data.kieApiKey !== "") {
    update.kieApiKey = data.kieApiKey === "-" ? null : data.kieApiKey.trim();
  }
  if (data.openrouterModel) update.openrouterModel = data.openrouterModel;
  if (data.voiceInput !== undefined) update.voiceInput = data.voiceInput;
  if (data.voiceAnnounce !== undefined)
    update.voiceAnnounce = data.voiceAnnounce;
  if (data.voiceModel) update.voiceModel = data.voiceModel.trim();

  await prisma.settings.upsert({
    where: { id: 1 },
    update,
    create: { id: 1, ...update },
  });
  revalidatePath("/settings");
}

// Épingle / désépingle un modèle ; renvoie la liste à jour pour que le
// sélecteur reste synchronisé sans recharger la page.
export async function togglePinnedModel(model: string): Promise<string[]> {
  const id = model.trim();
  if (!id) return [];
  const current = await prisma.settings.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1 },
  });
  const pinnedModels = current.pinnedModels.includes(id)
    ? current.pinnedModels.filter((m) => m !== id)
    : [...current.pinnedModels, id];

  await prisma.settings.update({ where: { id: 1 }, data: { pinnedModels } });
  revalidatePath("/settings");
  revalidatePath("/programs/new");
  return pinnedModels;
}

// Promeut un modèle en modèle par défaut, depuis n'importe quel écran.
export async function setDefaultModel(model: string) {
  const id = model.trim();
  if (!id) return;
  await prisma.settings.upsert({
    where: { id: 1 },
    update: { openrouterModel: id },
    create: { id: 1, openrouterModel: id },
  });
  revalidatePath("/settings");
  revalidatePath("/programs/new");
}

// ---------- Programmes ----------

// Données imbriquées communes à la création d'un programme depuis un draft
// (création initiale et blocs suivants) : préserve muscles, temps et variations.
function draftCreateData(parsed: ProgramDraft) {
  return {
    name: parsed.name,
    description: parsed.description ?? null,
    blockCycles: parsed.blockCycles ?? null,
    days: {
      create: parsed.days.map((day, di) => ({
        dayIndex: di,
        name: day.name,
        focus: day.focus ?? null,
        exercises: {
          create: day.exercises.map((ex, ei) => ({
            order: ei,
            name: ex.name,
            sets: ex.sets,
            reps: ex.reps,
            restSeconds: ex.restSeconds,
            weightHint: ex.weightHint ?? null,
            equipment: ex.equipment ?? [],
            muscles: ex.muscles ?? [],
            targetSeconds: ex.targetSeconds ?? null,
            setSeconds: ex.setSeconds ?? null,
            transitionSeconds: ex.transitionSeconds ?? null,
            notes: ex.notes ?? null,
            variations: {
              create: (ex.variations ?? []).map((v, vi) => ({
                order: vi,
                name: v.name,
                sets: v.sets,
                reps: v.reps,
                restSeconds: v.restSeconds,
                weightHint: v.weightHint ?? null,
                equipment: v.equipment ?? [],
                muscles: v.muscles ?? [],
                targetSeconds: v.targetSeconds ?? null,
                setSeconds: v.setSeconds ?? null,
                notes: v.notes ?? null,
              })),
            },
          })),
        },
      })),
    },
  };
}

// Muscles de tous les exercices et variantes d'un draft (avec doublons —
// ensureMusclesExist dédoublonne par nom normalisé).
function draftMuscleNames(draft: ProgramDraft): string[] {
  return draft.days.flatMap((d) =>
    d.exercises.flatMap((ex) => [
      ...ex.muscles,
      ...ex.variations.flatMap((v) => v.muscles),
    ])
  );
}

// Combinaisons de muscles ciblées par chaque exercice/variante du draft
// (une image combinée est générée par combinaison inédite de ≥ 2 muscles).
function draftMuscleSets(draft: ProgramDraft): string[][] {
  return draft.days.flatMap((d) =>
    d.exercises.flatMap((ex) => [
      ex.muscles,
      ...ex.variations.map((v) => v.muscles),
    ])
  );
}

export async function saveProgram(
  draft: ProgramDraft,
  meta: { locationId?: string | null; goal?: string | null; level?: string | null }
): Promise<string> {
  const parsed = programDraftSchema.parse(draft);
  // Le draft a pu être édité côté client : on recolle les muscles sur les
  // noms canoniques (le popup de prévisualisation matche Muscle.name par nom)
  // et on crée en base ceux qui sont réellement nouveaux.
  resolveDraftMuscles(parsed, await getKnownMuscles());
  const program = await prisma.program.create({
    data: {
      ...draftCreateData(parsed),
      goal: meta.goal ?? null,
      level: meta.level ?? null,
      locationId: meta.locationId ?? null,
    },
  });
  await ensureMusclesExist(draftMuscleNames(parsed));
  await ensureMuscleCombosExist(draftMuscleSets(parsed));
  revalidatePath("/");
  return program.id;
}

// Enregistre le bloc suivant d'un programme : nouveau programme chaîné au
// précédent (même contexte/objectif/niveau), le prédécesseur est archivé.
export async function saveNextBlock(
  previousProgramId: string,
  draft: ProgramDraft
): Promise<string> {
  const parsed = programDraftSchema.parse(draft);
  resolveDraftMuscles(parsed, await getKnownMuscles());
  const prev = await prisma.program.findUniqueOrThrow({
    where: { id: previousProgramId },
    select: { goal: true, level: true, locationId: true, blockNumber: true },
  });
  const program = await prisma.$transaction(async (tx) => {
    const created = await tx.program.create({
      data: {
        ...draftCreateData(parsed),
        goal: prev.goal,
        level: prev.level,
        locationId: prev.locationId,
        blockNumber: prev.blockNumber + 1,
        previousProgramId,
      },
    });
    await tx.program.update({
      where: { id: previousProgramId },
      data: { archivedAt: new Date() },
    });
    return created;
  });
  await ensureMusclesExist(draftMuscleNames(parsed));
  await ensureMuscleCombosExist(draftMuscleSets(parsed));
  revalidatePath("/");
  revalidatePath(`/programs/${previousProgramId}`);
  return program.id;
}

export type ProgramUpdatePayload = {
  name: string;
  description?: string | null;
  days: {
    id?: string | null;
    name: string;
    focus?: string | null;
    exercises: {
      id?: string | null;
      name: string;
      sets: number;
      reps: string;
      restSeconds: number;
      weightHint?: string | null;
      equipment: string[];
      // Optionnels : écrits seulement s'ils sont fournis (modification IA) ;
      // l'éditeur manuel ne les touche pas.
      muscles?: string[];
      targetSeconds?: number | null;
      setSeconds?: number | null;
      transitionSeconds?: number | null;
      notes?: string | null;
    }[];
  }[];
};

// Met à jour un programme en conservant les ids existants (et donc
// l'historique de séances) quand c'est possible.
export async function updateProgram(programId: string, payload: ProgramUpdatePayload) {
  const knownMuscles = await getKnownMuscles();
  await prisma.$transaction(async (tx) => {
    await tx.program.update({
      where: { id: programId },
      data: { name: payload.name, description: payload.description ?? null },
    });

    const keepDayIds = payload.days.map((d) => d.id).filter(Boolean) as string[];
    await tx.programDay.deleteMany({
      where: { programId, id: { notIn: keepDayIds } },
    });

    for (let di = 0; di < payload.days.length; di++) {
      const day = payload.days[di];
      let dayId = day.id;
      if (dayId) {
        await tx.programDay.update({
          where: { id: dayId },
          data: { dayIndex: di, name: day.name, focus: day.focus ?? null },
        });
      } else {
        const created = await tx.programDay.create({
          data: {
            programId,
            dayIndex: di,
            name: day.name,
            focus: day.focus ?? null,
          },
        });
        dayId = created.id;
      }

      const keepExIds = day.exercises.map((e) => e.id).filter(Boolean) as string[];
      await tx.exercise.deleteMany({
        where: { dayId, id: { notIn: keepExIds } },
      });

      for (let ei = 0; ei < day.exercises.length; ei++) {
        const ex = day.exercises[ei];
        const data = {
          order: ei,
          name: ex.name,
          sets: ex.sets,
          reps: ex.reps,
          restSeconds: ex.restSeconds,
          weightHint: ex.weightHint ?? null,
          equipment: ex.equipment ?? [],
          notes: ex.notes ?? null,
          // Champs optionnels : seulement quand fournis (modification IA).
          ...(ex.muscles !== undefined
            ? { muscles: resolveMuscleNames(ex.muscles, knownMuscles) }
            : {}),
          ...(ex.targetSeconds !== undefined
            ? { targetSeconds: ex.targetSeconds }
            : {}),
          ...(ex.setSeconds !== undefined ? { setSeconds: ex.setSeconds } : {}),
          ...(ex.transitionSeconds !== undefined
            ? { transitionSeconds: ex.transitionSeconds }
            : {}),
        };
        if (ex.id) {
          await tx.exercise.update({ where: { id: ex.id }, data });
        } else {
          await tx.exercise.create({ data: { ...data, dayId } });
        }
      }
    }
  });
  const muscleSets = payload.days.flatMap((d) =>
    d.exercises.map((e) => e.muscles ?? [])
  );
  await ensureMusclesExist(muscleSets.flat());
  await ensureMuscleCombosExist(muscleSets);
  revalidatePath(`/programs/${programId}`);
  revalidatePath("/");
}

export async function duplicateProgram(id: string): Promise<string> {
  const program = await prisma.program.findUniqueOrThrow({
    where: { id },
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
  const copy = await prisma.program.create({
    data: {
      name: `${program.name} (copie)`,
      description: program.description,
      goal: program.goal,
      level: program.level,
      locationId: program.locationId,
      days: {
        create: program.days.map((day) => ({
          dayIndex: day.dayIndex,
          name: day.name,
          focus: day.focus,
          exercises: {
            create: day.exercises.map((ex) => ({
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
              videoPrompt: ex.videoPrompt,
              variations: {
                create: ex.variations.map((v) => ({
                  order: v.order,
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
                  videoPrompt: v.videoPrompt,
                })),
              },
            })),
          },
        })),
      },
    },
  });
  revalidatePath("/");
  return copy.id;
}

export async function deleteProgram(id: string) {
  await prisma.program.delete({ where: { id } });
  revalidatePath("/");
  redirect("/");
}

// ---------- Séances ----------

export async function startSession(dayId: string) {
  // Reprend la séance en cours pour ce jour si elle existe.
  const existing = await prisma.workoutSession.findFirst({
    where: { dayId, completedAt: null },
    orderBy: { startedAt: "desc" },
  });
  let session = existing;
  if (!session) {
    // N° de passage sur ce jour : pilote la rotation des variantes d'exercices.
    const cycleIndex = await prisma.workoutSession.count({
      where: { dayId, completedAt: { not: null } },
    });
    session = await prisma.workoutSession.create({
      data: { dayId, cycleIndex },
    });
  }
  redirect(`/workout/${session.id}`);
}

// Choix manuel de variante pour un exercice, persisté sur la séance pour
// survivre aux rechargements et reprises.
export async function setSessionVariation(
  sessionId: string,
  exerciseId: string,
  index: number
) {
  const session = await prisma.workoutSession.findUnique({
    where: { id: sessionId },
    select: { variationChoices: true },
  });
  if (!session) return;
  const choices =
    session.variationChoices &&
    typeof session.variationChoices === "object" &&
    !Array.isArray(session.variationChoices)
      ? (session.variationChoices as Record<string, number>)
      : {};
  await prisma.workoutSession.update({
    where: { id: sessionId },
    data: { variationChoices: { ...choices, [exerciseId]: index } },
  });
}

export async function abandonSession(sessionId: string) {
  await prisma.workoutSession.delete({ where: { id: sessionId } });
  revalidatePath("/");
  redirect("/");
}

// ————— Suivi corporel —————

// Ajoute une mesure (poids, masse musculaire, % graisse — valeurs lues p. ex.
// sur la montre). Au moins une valeur numérique est requise.
export async function addBodyMeasurement(input: {
  date: string;
  weightKg?: number | null;
  muscleMassKg?: number | null;
  bodyFatPct?: number | null;
  notes?: string | null;
}) {
  const clean = (v: number | null | undefined, max: number) =>
    typeof v === "number" && isFinite(v) && v > 0 && v <= max ? v : null;
  const weightKg = clean(input.weightKg, 400);
  const muscleMassKg = clean(input.muscleMassKg, 200);
  const bodyFatPct = clean(input.bodyFatPct, 80);
  if (weightKg === null && muscleMassKg === null && bodyFatPct === null) {
    throw new Error("Renseigne au moins une valeur.");
  }
  const date = !isNaN(Date.parse(input.date)) ? new Date(input.date) : new Date();
  await prisma.bodyMeasurement.create({
    data: {
      date,
      weightKg,
      muscleMassKg,
      bodyFatPct,
      notes: input.notes?.trim() ? input.notes.trim().slice(0, 300) : null,
    },
  });
  revalidatePath("/body");
}

export async function deleteBodyMeasurement(id: string) {
  await prisma.bodyMeasurement.delete({ where: { id } });
  revalidatePath("/body");
}

// Supprime une photo de suivi ; le fichier local est effacé s'il n'est plus
// référencé par aucune autre photo.
export async function deleteProgressPhoto(id: string) {
  const photo = await prisma.progressPhoto.delete({ where: { id } });
  const stillUsed = await prisma.progressPhoto.count({
    where: { imageUrl: photo.imageUrl },
  });
  if (stillUsed === 0) await deleteLocalMedia(photo.imageUrl);
  revalidatePath("/body");
}
