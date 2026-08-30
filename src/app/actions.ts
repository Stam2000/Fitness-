"use server";

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { programDraftSchema, type ProgramDraft } from "@/lib/program-schema";
import {
  buildProgramSnapshot,
  buildSessionPlan,
  diffSnapshots,
  latestVersionId,
  parseProgramSnapshot,
  recordProgramVersion,
  summarizeDiff,
  type VersionSource,
} from "@/lib/program-versions";
import {
  ensureMuscleCombosExist,
  ensureMusclesExist,
  getKnownMuscles,
  resolveDraftMuscles,
  resolveMuscleNames,
} from "@/lib/known-muscles";
import { deleteLocalMedia } from "@/lib/media-store";
import {
  dayRange,
  isIsoDay,
  scaleItemBy,
  scaleItemToGrams,
  toIsoDay,
} from "@/lib/meals";
import { findActivity, findObjective } from "@/lib/nutrition";
import { clampSteps, estimateCardio, estimateSteps } from "@/lib/cardio";
import { requireActionAdmin, requireActionUser } from "@/lib/session";
import {
  NOT_FOUND,
  assertOwnsProgram,
  assertOwnsVariation,
  ownsDay,
} from "@/lib/ownership";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

// Toutes les actions de ce fichier commencent par `requireActionUser()` et
// filtrent leurs requêtes par `userId` : viser l'identifiant d'un autre compte
// doit échouer comme si la ressource n'existait pas. Le catalogue partagé
// (matériel, muscles) et les réglages globaux font exception — voir plus bas.

// ---------- Contextes & équipement ----------

// Renvoie l'id du contexte créé pour que l'interface puisse le sélectionner
// aussitôt (sans quoi la création passe inaperçue).
export async function createLocation(
  name: string,
  icon: string
): Promise<string | null> {
  const user = await requireActionUser();
  if (!name.trim()) return null;
  const location = await prisma.location.create({
    data: { name: name.trim(), icon, userId: user.id },
  });
  revalidatePath("/equipment");
  revalidatePath("/programs/new");
  revalidatePath("/");
  return location.id;
}

export async function updateLocation(id: string, name: string, icon: string) {
  const user = await requireActionUser();
  if (!name.trim()) return;
  // updateMany + filtre propriétaire : un id étranger ne modifie rien.
  await prisma.location.updateMany({
    where: { id, userId: user.id },
    data: { name: name.trim(), icon },
  });
  revalidatePath("/equipment");
  revalidatePath("/");
}

export async function deleteLocation(id: string) {
  const user = await requireActionUser();
  await prisma.location.deleteMany({ where: { id, userId: user.id } });
  revalidatePath("/equipment");
  revalidatePath("/");
}

export async function toggleLocationEquipment(
  locationId: string,
  equipmentId: string,
  enabled: boolean
) {
  const user = await requireActionUser();
  const owned = await prisma.location.count({
    where: { id: locationId, userId: user.id },
  });
  if (!owned) throw new Error(NOT_FOUND);
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

// Le catalogue de matériel est commun à tous les comptes (comme les muscles
// et les vidéos de mouvement) : y ajouter une entrée ne révèle rien de
// personnel et évite de regénérer les images pour chaque nouvel inscrit.
export async function createEquipment(name: string, category: string) {
  await requireActionUser();
  if (!name.trim()) return;
  await prisma.equipment.upsert({
    where: { name: name.trim() },
    update: {},
    create: { name: name.trim(), category: category || "Accessoires" },
  });
  revalidatePath("/equipment");
}

// ---------- Réglages ----------

// Deux portées dans un même formulaire : les préférences de dictée sont
// personnelles, tandis que les clés API et le choix des modèles engagent le
// budget de l'administrateur — lui seul peut les toucher.
export async function saveSettings(data: {
  openrouterApiKey?: string;
  openrouterModel?: string;
  kieApiKey?: string;
  voiceInput?: boolean;
  voiceAnnounce?: boolean;
  voiceModel?: string;
  visionModel?: string;
}) {
  const user = await requireActionUser();

  if (data.voiceInput !== undefined || data.voiceAnnounce !== undefined) {
    const prefs = {
      ...(data.voiceInput !== undefined ? { voiceInput: data.voiceInput } : {}),
      ...(data.voiceAnnounce !== undefined
        ? { voiceAnnounce: data.voiceAnnounce }
        : {}),
    };
    await prisma.userSettings.upsert({
      where: { userId: user.id },
      update: prefs,
      create: { userId: user.id, ...prefs },
    });
  }

  const update: Record<string, string | null> = {};
  // Champ vide = ne pas changer ; "-" seul = effacer la clé.
  if (data.openrouterApiKey !== undefined && data.openrouterApiKey !== "") {
    update.openrouterApiKey =
      data.openrouterApiKey === "-" ? null : data.openrouterApiKey.trim();
  }
  if (data.kieApiKey !== undefined && data.kieApiKey !== "") {
    update.kieApiKey = data.kieApiKey === "-" ? null : data.kieApiKey.trim();
  }
  if (data.openrouterModel) update.openrouterModel = data.openrouterModel;
  if (data.voiceModel) update.voiceModel = data.voiceModel.trim();
  if (data.visionModel) update.visionModel = data.visionModel.trim();

  if (Object.keys(update).length > 0) {
    if (!user.isAdmin) {
      throw new Error("Clés API et modèles : réservés à l'administrateur.");
    }
    await prisma.settings.upsert({
      where: { id: 1 },
      update,
      create: { id: 1, ...update },
    });
  }
  revalidatePath("/settings");
}

// Épingle / désépingle un modèle ; renvoie la liste à jour pour que le
// sélecteur reste synchronisé sans recharger la page.
export async function togglePinnedModel(model: string): Promise<string[]> {
  await requireActionAdmin();
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
  await requireActionAdmin();
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
  const user = await requireActionUser();
  const parsed = programDraftSchema.parse(draft);
  // Le draft a pu être édité côté client : on recolle les muscles sur les
  // noms canoniques (le popup de prévisualisation matche Muscle.name par nom)
  // et on crée en base ceux qui sont réellement nouveaux.
  resolveDraftMuscles(parsed, await getKnownMuscles());
  // Le contexte doit appartenir à l'appelant : sinon on n'en attache aucun
  // plutôt que de lier son programme au lieu de quelqu'un d'autre.
  const locationId = meta.locationId
    ? ((
        await prisma.location.findFirst({
          where: { id: meta.locationId, userId: user.id },
          select: { id: true },
        })
      )?.id ?? null)
    : null;
  const program = await prisma.program.create({
    data: {
      ...draftCreateData(parsed),
      goal: meta.goal ?? null,
      level: meta.level ?? null,
      locationId,
      userId: user.id,
    },
  });
  await ensureMusclesExist(draftMuscleNames(parsed));
  await ensureMuscleCombosExist(draftMuscleSets(parsed));
  await recordProgramVersion(program.id, "creation", "Programme généré");
  revalidatePath("/");
  return program.id;
}

// Enregistre le bloc suivant d'un programme : nouveau programme chaîné au
// précédent (même contexte/objectif/niveau), le prédécesseur est archivé.
export async function saveNextBlock(
  previousProgramId: string,
  draft: ProgramDraft
): Promise<string> {
  const user = await requireActionUser();
  const parsed = programDraftSchema.parse(draft);
  resolveDraftMuscles(parsed, await getKnownMuscles());
  const prev = await prisma.program.findFirst({
    where: { id: previousProgramId, userId: user.id },
    select: { goal: true, level: true, locationId: true, blockNumber: true },
  });
  if (!prev) throw new Error(NOT_FOUND);
  const program = await prisma.$transaction(async (tx) => {
    const created = await tx.program.create({
      data: {
        ...draftCreateData(parsed),
        goal: prev.goal,
        level: prev.level,
        locationId: prev.locationId,
        blockNumber: prev.blockNumber + 1,
        previousProgramId,
        userId: user.id,
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
  await recordProgramVersion(
    program.id,
    "creation",
    `Bloc ${prev.blockNumber + 1}`
  );
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

// Met à jour un programme en conservant les ids existants quand c'est
// possible. Les séries déjà enregistrées ne dépendent plus de ces lignes
// (elles portent leur propre nom d'exercice et chaque séance garde son plan
// figé) : retirer un exercice n'efface donc plus son historique, il disparaît
// seulement des séances à venir.
export async function updateProgram(
  programId: string,
  payload: ProgramUpdatePayload,
  source: VersionSource = "edit"
) {
  const user = await requireActionUser();
  await assertOwnsProgram(programId, user.id);
  const knownMuscles = await getKnownMuscles();
  // Relevé de l'état d'avant : sert à décrire le changement dans la version.
  const before = await buildProgramSnapshot(prisma, programId);
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

  const after = await buildProgramSnapshot(prisma, programId);
  await recordProgramVersion(
    programId,
    source,
    before && after ? summarizeDiff(diffSnapshots(before, after)) : null
  );

  revalidatePath(`/programs/${programId}`);
  revalidatePath("/");
}

export async function duplicateProgram(id: string): Promise<string> {
  const user = await requireActionUser();
  const program = await prisma.program.findFirst({
    where: { id, userId: user.id },
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
  if (!program) throw new Error(NOT_FOUND);
  const copy = await prisma.program.create({
    data: {
      userId: user.id,
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
  await recordProgramVersion(
    copy.id,
    "creation",
    `Copie de « ${program.name} »`
  );
  revalidatePath("/");
  return copy.id;
}

// Réécrit le programme tel qu'il était dans une version antérieure.
//
// Les lignes sont recréées avec LEURS IDENTIFIANTS D'ORIGINE : un exercice
// retiré puis restauré retrouve son id, et donc le lien avec les séries déjà
// enregistrées sous cet id (suggestions de charge, dernier passage). La
// restauration est elle-même versionnée, si bien qu'elle n'est jamais un
// aller sans retour.
export async function restoreProgramVersion(versionId: string): Promise<void> {
  const user = await requireActionUser();
  const version = await prisma.programVersion.findFirst({
    where: { id: versionId, program: { userId: user.id } },
    select: { programId: true, versionNumber: true, snapshot: true },
  });
  if (!version) throw new Error(NOT_FOUND);
  const snapshot = parseProgramSnapshot(version.snapshot);
  if (!snapshot) throw new Error("Version illisible.");

  const programId = version.programId;
  await prisma.$transaction(async (tx) => {
    await tx.program.update({
      where: { id: programId },
      data: { name: snapshot.name, description: snapshot.description },
    });

    await tx.programDay.deleteMany({
      where: { programId, id: { notIn: snapshot.days.map((d) => d.id) } },
    });

    for (let di = 0; di < snapshot.days.length; di++) {
      const day = snapshot.days[di];
      const dayData = { dayIndex: di, name: day.name, focus: day.focus };
      await tx.programDay.upsert({
        where: { id: day.id },
        update: dayData,
        create: { ...dayData, id: day.id, programId },
      });

      await tx.exercise.deleteMany({
        where: { dayId: day.id, id: { notIn: day.exercises.map((e) => e.id) } },
      });

      for (let ei = 0; ei < day.exercises.length; ei++) {
        const ex = day.exercises[ei];
        const exData = {
          order: ei,
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
        };
        await tx.exercise.upsert({
          where: { id: ex.id },
          update: exData,
          create: { ...exData, id: ex.id, dayId: day.id },
        });

        await tx.exerciseVariation.deleteMany({
          where: {
            exerciseId: ex.id,
            id: { notIn: ex.variations.map((v) => v.id) },
          },
        });

        for (let vi = 0; vi < ex.variations.length; vi++) {
          const v = ex.variations[vi];
          const vData = {
            order: vi,
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
          };
          await tx.exerciseVariation.upsert({
            where: { id: v.id },
            update: vData,
            create: { ...vData, id: v.id, exerciseId: ex.id },
          });
        }
      }
    }
  });

  const muscleSets = snapshot.days.flatMap((d) =>
    d.exercises.flatMap((e) => [e.muscles, ...e.variations.map((v) => v.muscles)])
  );
  await ensureMusclesExist(muscleSets.flat());
  await ensureMuscleCombosExist(muscleSets);

  await recordProgramVersion(
    programId,
    "restore",
    `Retour à la version ${version.versionNumber}`
  );
  revalidatePath(`/programs/${programId}`);
  revalidatePath("/");
}

export async function deleteProgram(id: string) {
  const user = await requireActionUser();
  await prisma.program.deleteMany({ where: { id, userId: user.id } });
  revalidatePath("/");
  redirect("/");
}

// ---------- Séances ----------

export async function startSession(dayId: string) {
  const user = await requireActionUser();
  if (!(await ownsDay(dayId, user.id))) throw new Error(NOT_FOUND);
  // Reprend la séance en cours pour ce jour si elle existe.
  const existing = await prisma.workoutSession.findFirst({
    where: { dayId, userId: user.id, completedAt: null },
    orderBy: { startedAt: "desc" },
  });
  let session = existing;
  if (!session) {
    // N° de passage sur ce jour : pilote la rotation des variantes d'exercices.
    // Compté par utilisateur — un programme partagé par duplication ne doit
    // pas faire avancer le cycle de son auteur.
    const [cycleIndex, plan] = await Promise.all([
      prisma.workoutSession.count({
        where: { dayId, userId: user.id, completedAt: { not: null } },
      }),
      // Plan figé dès le départ : si le programme est modifié pendant la
      // séance, ce qui a été prescrit reste consultable. Il est rafraîchi à la
      // clôture pour tenir compte d'une retouche faite en cours de route.
      buildSessionPlan(prisma, dayId),
    ]);
    session = await prisma.workoutSession.create({
      data: {
        dayId,
        cycleIndex,
        userId: user.id,
        planSnapshot: (plan ?? undefined) as Prisma.InputJsonValue | undefined,
        programVersionId: plan?.programId
          ? await latestVersionId(plan.programId)
          : null,
      },
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
  const user = await requireActionUser();
  const session = await prisma.workoutSession.findFirst({
    where: { id: sessionId, userId: user.id },
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
  const user = await requireActionUser();
  await prisma.workoutSession.deleteMany({
    where: { id: sessionId, userId: user.id },
  });
  revalidatePath("/");
  redirect("/");
}

// Promeut une variante en exercice par défaut : tous les champs descriptifs
// sont ÉCHANGÉS entre la variante et l'exercice de base (aucun id ne change,
// l'historique de séances reste attaché), et les logs sont réétiquetés par
// nom : ceux de la variante promue deviennent « base » (variationName null),
// ceux de l'ancien base prennent son ancien nom. L'attribution exacte de
// l'historique — et donc les suggestions de charge — est ainsi préservée.
export async function promoteVariation(variationId: string) {
  const user = await requireActionUser();
  await assertOwnsVariation(variationId, user.id);
  const variation = await prisma.exerciseVariation.findUniqueOrThrow({
    where: { id: variationId },
    include: { exercise: { include: { day: { select: { programId: true } } } } },
  });
  const exercise = variation.exercise;

  await prisma.$transaction(async (tx) => {
    // Ordre important : d'abord étiqueter les logs du base avec son ancien
    // nom, PUIS passer ceux de la variante promue à null.
    await tx.setLog.updateMany({
      where: { exerciseId: exercise.id, variationName: null },
      data: { variationName: exercise.name },
    });
    await tx.setLog.updateMany({
      where: { exerciseId: exercise.id, variationName: variation.name },
      data: { variationName: null },
    });
    await tx.exercise.update({
      where: { id: exercise.id },
      data: {
        name: variation.name,
        sets: variation.sets,
        reps: variation.reps,
        restSeconds: variation.restSeconds,
        weightHint: variation.weightHint,
        equipment: variation.equipment,
        muscles: variation.muscles,
        targetSeconds: variation.targetSeconds,
        setSeconds: variation.setSeconds,
        notes: variation.notes,
        howTo: variation.howTo,
        imageUrl: variation.imageUrl,
        imageTaskId: variation.imageTaskId,
        videoUrl: variation.videoUrl,
        videoTaskId: variation.videoTaskId,
        videoPrompt: variation.videoPrompt,
      },
    });
    await tx.exerciseVariation.update({
      where: { id: variationId },
      data: {
        name: exercise.name,
        sets: exercise.sets,
        reps: exercise.reps,
        restSeconds: exercise.restSeconds,
        weightHint: exercise.weightHint,
        equipment: exercise.equipment,
        muscles: exercise.muscles,
        targetSeconds: exercise.targetSeconds,
        setSeconds: exercise.setSeconds,
        notes: exercise.notes,
        howTo: exercise.howTo,
        imageUrl: exercise.imageUrl,
        imageTaskId: exercise.imageTaskId,
        videoUrl: exercise.videoUrl,
        videoTaskId: exercise.videoTaskId,
        videoPrompt: exercise.videoPrompt,
      },
    });
  });

  await recordProgramVersion(
    exercise.day.programId,
    "edit",
    `Variante promue : ${variation.name}`
  );
  revalidatePath(`/programs/${exercise.day.programId}`);
  revalidatePath("/");
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
  const user = await requireActionUser();
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
      userId: user.id,
    },
  });
  revalidatePath("/body");
}

export async function deleteBodyMeasurement(id: string) {
  const user = await requireActionUser();
  await prisma.bodyMeasurement.deleteMany({ where: { id, userId: user.id } });
  revalidatePath("/body");
}

// ————— Objectifs nutritionnels —————

// Enregistre (ou remplace) les objectifs du compte : poids visé, calories et
// protéines quotidiennes. Les trois cibles sont indépendantes — on peut ne
// fixer qu'un poids visé, ou que les apports — mais une ligne sans aucune
// valeur n'aurait rien à afficher, d'où le refus.
//
// Les valeurs reçues sont celles que l'utilisateur a validées à l'écran, que
// le formulaire les ait suggérées ou qu'il les ait saisies : hors bornes, on
// lève plutôt que de remplacer silencieusement par null, sans quoi une faute
// de frappe effacerait l'objectif sans le dire.
export async function saveNutritionGoal(input: {
  objective: string;
  activity: string;
  targetWeightKg?: number | null;
  dailyCalories?: number | null;
  dailyProteinG?: number | null;
}) {
  const user = await requireActionUser();

  const bounded = (
    value: number | null | undefined,
    label: string,
    min: number,
    max: number,
    unit: string
  ): number | null => {
    if (value === null || value === undefined) return null;
    if (!isFinite(value) || value < min || value > max) {
      throw new Error(`${label} : indique une valeur entre ${min} et ${max} ${unit}.`);
    }
    return value;
  };

  const targetWeightKg = bounded(input.targetWeightKg, "Poids visé", 30, 400, "kg");
  const dailyCalories = bounded(input.dailyCalories, "Calories", 800, 8000, "kcal");
  const dailyProteinG = bounded(input.dailyProteinG, "Protéines", 20, 500, "g");

  if (targetWeightKg === null && dailyCalories === null && dailyProteinG === null) {
    throw new Error("Fixe au moins un objectif.");
  }

  const data = {
    objective: findObjective(input.objective).key,
    activity: findActivity(input.activity).key,
    targetWeightKg: targetWeightKg === null ? null : Math.round(targetWeightKg * 10) / 10,
    dailyCalories: dailyCalories === null ? null : Math.round(dailyCalories),
    dailyProteinG: dailyProteinG === null ? null : Math.round(dailyProteinG),
  };

  await prisma.nutritionGoal.upsert({
    where: { userId: user.id },
    update: data,
    create: { userId: user.id, ...data },
  });
  revalidatePath("/body");
}

export async function deleteNutritionGoal() {
  const user = await requireActionUser();
  await prisma.nutritionGoal.deleteMany({ where: { userId: user.id } });
  revalidatePath("/body");
}

// Supprime une photo de suivi ; le fichier local est effacé s'il n'est plus
// référencé par aucune autre photo.
export async function deleteProgressPhoto(id: string) {
  const user = await requireActionUser();
  const photo = await prisma.progressPhoto.findFirst({
    where: { id, userId: user.id },
  });
  if (!photo) return;
  await prisma.progressPhoto.delete({ where: { id: photo.id } });
  if (await isMediaUnused(photo.imageUrl)) {
    await deleteLocalMedia(photo.imageUrl);
  }
  revalidatePath("/body");
}

// Le nom de fichier dérive du contenu : deux comptes qui téléversent la même
// image partagent le même fichier, et depuis l'arrivée du journal des repas
// deux TABLES le partagent aussi. Le comptage est donc volontairement non
// filtré par utilisateur, et porte sur les deux tables — effacer une photo de
// suivi ne doit pas crever l'image d'un repas, ni l'inverse.
async function isMediaUnused(imageUrl: string): Promise<boolean> {
  const [photos, meals] = await Promise.all([
    prisma.progressPhoto.count({ where: { imageUrl } }),
    prisma.meal.count({ where: { imageUrl } }),
  ]);
  return photos + meals === 0;
}

// ---------- Repas ----------

/**
 * Retient ou écarte une ligne de repas — la seule écriture faite après
 * l'analyse, puisque le total se recalcule à la lecture.
 *
 * `answeredAt` date la décision : pour une hypothèse, il distingue un « non »
 * d'une question encore sans réponse, que l'écran n'affiche pas pareil (dans
 * le second cas le total est un minimum, pas un résultat).
 */
export async function setMealItemIncluded(itemId: string, included: boolean) {
  const user = await requireActionUser();
  // updateMany + filtre propriétaire traversant la relation : viser la ligne
  // d'un autre compte ne modifie rien.
  await prisma.mealItem.updateMany({
    where: { id: itemId, meal: { userId: user.id } },
    data: { included, answeredAt: new Date() },
  });
  revalidatePath("/body/meals");
  revalidatePath("/");
}

/**
 * Corrige la portion d'une ligne et recalcule ses apports au prorata. Une
 * portion mal estimée est la première source d'erreur d'une analyse photo :
 * doubler les grammes doit doubler les calories.
 *
 * `factor` sert aux lignes dont le modèle n'a pas su chiffrer la masse
 * (« 1 bol ») : l'écran propose alors ×0,5 / ×2 plutôt que des grammes.
 */
export async function setMealItemPortion(
  itemId: string,
  change: { grams: number } | { factor: number }
) {
  const user = await requireActionUser();
  const item = await prisma.mealItem.findFirst({
    where: { id: itemId, meal: { userId: user.id } },
  });
  if (!item) return;

  const current = {
    kcal: item.kcal,
    proteinG: item.proteinG,
    carbsG: item.carbsG,
    fatG: item.fatG,
    grams: item.grams,
  };
  const next =
    "grams" in change
      ? scaleItemToGrams(current, change.grams)
      : scaleItemBy(current, change.factor);

  await prisma.mealItem.update({
    where: { id: item.id },
    data: {
      kcal: next.kcal,
      proteinG: next.proteinG,
      carbsG: next.carbsG,
      fatG: next.fatG,
      grams: next.grams,
      // Le libellé du modèle (« 1 filet ») ne décrit plus la portion retenue.
      quantityLabel: next.grams ? `${next.grams} g` : item.quantityLabel,
    },
  });
  revalidatePath("/body/meals");
  revalidatePath("/");
}

/** Précisions ajoutées après coup ; la relance d'analyse les reprendra. */
export async function updateMealNote(mealId: string, note: string) {
  const user = await requireActionUser();
  const trimmed = note.trim().slice(0, 500);
  await prisma.meal.updateMany({
    where: { id: mealId, userId: user.id },
    data: { note: trimmed || null },
  });
  revalidatePath("/body/meals");
}

/** Supprime un repas, ses lignes (cascade) et sa photo si plus rien ne l'utilise. */
export async function deleteMeal(id: string) {
  const user = await requireActionUser();
  const meal = await prisma.meal.findFirst({ where: { id, userId: user.id } });
  if (!meal) return;
  await prisma.meal.delete({ where: { id: meal.id } });
  if (meal.imageUrl && (await isMediaUnused(meal.imageUrl))) {
    await deleteLocalMedia(meal.imageUrl);
  }
  revalidatePath("/body/meals");
  revalidatePath("/");
}

// ---------- Cardio (tapis de course) ----------

export async function logCardioSession(input: {
  speedKmh: number;
  inclinePct: number;
  minutes: number;
  weightKg: number;
  // Pas lus sur l'afficheur du tapis. Absents : estimés depuis la distance.
  steps?: number | null;
  // Jour visé (« AAAA-MM-JJ »), aujourd'hui par défaut — une marche d'hier
  // oubliée se rattrape. Un jour futur retombe sur aujourd'hui.
  dayKey?: string | null;
  notes?: string | null;
}): Promise<{ calories: number; distanceKm: number; steps: number }> {
  const user = await requireActionUser();
  const { speedKmh, inclinePct, minutes, weightKg } = input;
  if (speedKmh <= 0 || minutes <= 0 || weightKg <= 0) {
    throw new Error("Vitesse, durée et poids doivent être positifs.");
  }
  const { calories, distanceKm } = estimateCardio({
    speedKmh,
    inclinePct,
    minutes,
    weightKg,
  });
  const steps =
    input.steps != null
      ? clampSteps(input.steps)
      : clampSteps(estimateSteps(distanceKm, speedKmh));

  // L'heure courante est conservée même sur un jour passé : deux saisies du
  // même jour restent ainsi correctement ordonnées à l'affichage.
  const now = new Date();
  const todayKey = toIsoDay(now);
  const targetKey =
    isIsoDay(input.dayKey) && input.dayKey <= todayKey ? input.dayKey : todayKey;
  const { start } = dayRange(targetKey);
  const performedAt = new Date(
    start.getFullYear(),
    start.getMonth(),
    start.getDate(),
    now.getHours(),
    now.getMinutes(),
    now.getSeconds()
  );

  await prisma.cardioSession.create({
    data: {
      speedKmh,
      inclinePct,
      minutes,
      weightKg,
      calories,
      distanceKm,
      steps,
      notes: input.notes?.trim() || null,
      performedAt,
      userId: user.id,
    },
  });

  revalidatePath("/");
  revalidatePath("/history");
  return { calories, distanceKm, steps };
}

export async function deleteCardioSession(id: string) {
  const user = await requireActionUser();
  // Filtré par propriétaire : un id d'autrui ne supprime rien.
  await prisma.cardioSession.deleteMany({ where: { id, userId: user.id } });
  revalidatePath("/");
  revalidatePath("/history");
}
