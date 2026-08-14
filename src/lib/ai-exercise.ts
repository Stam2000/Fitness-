import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSettings } from "@/lib/settings";
import { AiError, chatCompletionText, extractJson } from "@/lib/openrouter";
import {
  exerciseSchema,
  variationSchema,
  type ExerciseDraft,
  type VariationDraft,
} from "@/lib/program-schema";
import { knownExercisesBlock } from "@/lib/program-prompt";
import { recordProgramVersionForExercise } from "@/lib/program-versions";
import {
  getKnownExercises,
  knownExerciseLines,
  resolveKnownRef,
} from "@/lib/known-exercises";
import {
  ensureMuscleCombosExist,
  ensureMusclesExist,
  getKnownMuscles,
  knownMusclesBlock,
  resolveMuscleNames,
} from "@/lib/known-muscles";
import { findExistingImageByName } from "@/lib/exercise-images";

const variationsResponseSchema = z.object({
  variations: z.array(variationSchema).min(1).max(2),
});

// Exercice chargé avec sa séance, son programme et l'équipement du lieu :
// le contexte commun aux prompts de substitution et de variantes.
async function loadExerciseContext(id: string, userId: string) {
  const exercise = await prisma.exercise.findFirst({
    where: { id, day: { program: { userId } } },
    include: {
      day: {
        include: {
          exercises: { orderBy: { order: "asc" } },
          program: {
            include: {
              location: {
                include: { equipment: { include: { equipment: true } } },
              },
            },
          },
        },
      },
    },
  });
  if (!exercise) {
    throw new AiError("Exercice introuvable", 404);
  }
  const program = exercise.day.program;
  const equipmentNames =
    program.location?.equipment.map((e) => e.equipment.name) ?? [];
  const otherNames = exercise.day.exercises
    .filter((e) => e.id !== id)
    .map((e) => e.name);
  return { exercise, program, equipmentNames, otherNames };
}

async function requireApiSettings() {
  const settings = await getSettings();
  if (!settings.openrouterApiKey) {
    throw new AiError("Aucune clé OpenRouter configurée (Réglages).", 400);
  }
  return settings as typeof settings & { openrouterApiKey: string };
}

// Propose UN exercice de remplacement équivalent (mêmes muscles), sans rien
// écrire en base.
export async function generateSubstitute(
  exerciseId: string,
  userId: string,
  reason?: string
): Promise<{ oldName: string; dayName: string; replacement: ExerciseDraft }> {
  const settings = await requireApiSettings();
  const { exercise, program, equipmentNames, otherNames } =
    await loadExerciseContext(exerciseId, userId);
  const [known, knownMuscles] = await Promise.all([
    getKnownExercises(userId),
    getKnownMuscles(),
  ]);
  const knownLines = knownExerciseLines(known);

  const prompt = `Dans la séance « ${exercise.day.name} » (objectif : ${program.goal ?? "non précisé"}, niveau : ${program.level ?? "non précisé"}), je veux remplacer cet exercice :
- ${exercise.name} : ${exercise.sets} × ${exercise.reps}, repos ${exercise.restSeconds}s${exercise.weightHint ? `, ${exercise.weightHint}` : ""}
${reason ? `Raison : ${reason}` : ""}

Équipement disponible : ${equipmentNames.length > 0 ? equipmentNames.join(", ") : "poids du corps uniquement"}
Exercices déjà présents dans la séance (à ne PAS proposer) : ${otherNames.join(", ") || "aucun"}
${knownLines.length > 0 ? `\n${knownExercisesBlock(knownLines)}\n` : ""}${knownMuscles.length > 0 ? `\n${knownMusclesBlock(knownMuscles)}\n` : ""}
Propose UN exercice de remplacement ciblant les mêmes muscles, adapté à la raison donnée. Utilise EXCLUSIVEMENT l'équipement listé ; combine librement plusieurs équipements dans l'exercice quand c'est pertinent (ex. haltères + banc), et liste dans "equipment" TOUTES les pièces utilisées. Réponds UNIQUEMENT avec un objet JSON :
{"name": "...", "sets": 4, "reps": "8-12", "restSeconds": 90, "weightHint": "..." , "equipment": ["..."], "muscles": ["1 à 4 muscles principaux, ex. Dos, Biceps"], "targetSeconds": 360, "setSeconds": 45, "notes": "conseil de technique court"}
("targetSeconds" = temps cible pour boucler l'exercice, toutes séries et repos compris ; "setSeconds" = temps cible d'exécution d'UNE série.)`;

  const content = await chatCompletionText({
    apiKey: settings.openrouterApiKey,
    model: settings.openrouterModel,
    messages: [
      {
        role: "system",
        content:
          "Tu es un coach sportif expert. Tu réponds uniquement en JSON valide, en français.",
      },
      { role: "user", content: prompt },
    ],
    temperature: 0.7,
  });
  const replacement = exerciseSchema.parse(extractJson(content));
  resolveKnownRef(replacement, known);
  replacement.muscles = resolveMuscleNames(replacement.muscles, knownMuscles);
  return {
    oldName: exercise.name,
    dayName: exercise.day.name,
    replacement,
  };
}

// Applique un remplacement : l'exercice du programme est mis à jour en place,
// ses médias sont réinitialisés et ses anciennes variantes supprimées
// (alternatives de l'ancien mouvement, elles n'ont plus de sens).
export async function applySubstitute(
  exerciseId: string,
  replacement: ExerciseDraft
) {
  const [updated] = await prisma.$transaction([
    prisma.exercise.update({
      where: { id: exerciseId },
      data: {
        name: replacement.name,
        sets: replacement.sets,
        reps: replacement.reps,
        restSeconds: replacement.restSeconds,
        weightHint: replacement.weightHint ?? null,
        equipment: replacement.equipment ?? [],
        muscles: replacement.muscles ?? [],
        targetSeconds: replacement.targetSeconds ?? null,
        setSeconds: replacement.setSeconds ?? null,
        notes: replacement.notes ?? null,
        imageUrl: null,
        imageTaskId: null,
        videoUrl: null,
        videoTaskId: null,
        videoPrompt: null,
      },
    }),
    prisma.exerciseVariation.deleteMany({ where: { exerciseId } }),
  ]);
  await ensureMusclesExist(replacement.muscles);
  await ensureMuscleCombosExist([replacement.muscles]);
  await recordProgramVersionForExercise(
    exerciseId,
    "ai",
    `Remplacé par « ${replacement.name} »`
  );
  return updated;
}

// Génère 2 exercices alternatifs (mêmes muscles) pour un exercice, sans rien
// écrire en base.
export async function generateVariations(
  exerciseId: string,
  userId: string
): Promise<{ exerciseName: string; variations: VariationDraft[] }> {
  const settings = await requireApiSettings();
  const { exercise, program, equipmentNames, otherNames } =
    await loadExerciseContext(exerciseId, userId);
  const [known, knownMuscles] = await Promise.all([
    getKnownExercises(userId),
    getKnownMuscles(),
  ]);
  const knownLines = knownExerciseLines(known);

  const prompt = `Dans la séance « ${exercise.day.name} » (objectif : ${program.goal ?? "non précisé"}, niveau : ${program.level ?? "non précisé"}), propose 2 exercices ALTERNATIFS à celui-ci, ciblant EXACTEMENT les mêmes muscles, pour être joués en rotation certaines semaines à sa place (varier les stimuli) :
- ${exercise.name} : ${exercise.sets} × ${exercise.reps}, repos ${exercise.restSeconds}s${exercise.muscles.length > 0 ? ` — muscles : ${exercise.muscles.join(", ")}` : ""}

Équipement disponible : ${equipmentNames.length > 0 ? equipmentNames.join(", ") : "poids du corps uniquement"} — utilise EXCLUSIVEMENT cet équipement ; combine librement plusieurs équipements et liste dans "equipment" TOUTES les pièces utilisées.
Ne propose NI l'exercice lui-même, NI un exercice déjà présent dans la séance : ${otherNames.join(", ") || "aucun"}.
${knownLines.length > 0 ? `\n${knownExercisesBlock(knownLines)}\n` : ""}${knownMuscles.length > 0 ? `\n${knownMusclesBlock(knownMuscles)}\n` : ""}
Réponds UNIQUEMENT avec un objet JSON :
{"variations": [{"name": "…", "sets": ${exercise.sets}, "reps": "…", "restSeconds": ${exercise.restSeconds}, "weightHint": "…", "equipment": ["…"], "muscles": ["…"], "targetSeconds": 360, "setSeconds": 45, "notes": "conseil court"}]}
("targetSeconds" = temps cible toutes séries et repos compris ; "setSeconds" = temps d'exécution d'UNE série.)`;

  const content = await chatCompletionText({
    apiKey: settings.openrouterApiKey,
    model: settings.openrouterModel,
    messages: [
      {
        role: "system",
        content:
          "Tu es un coach sportif expert. Tu réponds uniquement en JSON valide, en français.",
      },
      { role: "user", content: prompt },
    ],
    temperature: 0.7,
  });
  const parsed = variationsResponseSchema.parse(extractJson(content));

  // Résolutions (références #n, muscles canoniques) + écarter un éventuel
  // doublon de l'exercice de base malgré la consigne.
  const variations = parsed.variations.filter((v) => {
    resolveKnownRef(v, known);
    v.muscles = resolveMuscleNames(v.muscles, knownMuscles);
    return v.name.trim().toLowerCase() !== exercise.name.trim().toLowerCase();
  });
  if (variations.length === 0) {
    throw new AiError(
      "Le modèle n'a pas proposé d'alternative exploitable. Réessaie."
    );
  }
  return { exerciseName: exercise.name, variations };
}

// Enregistre des variantes en remplaçant les existantes (l'historique des
// variantes reste retrouvé par nom).
export async function applyVariations(
  exerciseId: string,
  variations: VariationDraft[]
): Promise<number> {
  // Une image existe déjà pour ce mouvement ? On la réutilise directement.
  const withImages = await Promise.all(
    variations.map(async (v) => ({
      ...v,
      imageUrl: await findExistingImageByName(v.name),
    }))
  );

  await prisma.$transaction(async (tx) => {
    await tx.exerciseVariation.deleteMany({ where: { exerciseId } });
    for (let i = 0; i < withImages.length; i++) {
      const v = withImages[i];
      await tx.exerciseVariation.create({
        data: {
          exerciseId,
          order: i,
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
          imageUrl: v.imageUrl ?? null,
        },
      });
    }
  });
  const allMuscles = withImages.flatMap((v) => v.muscles ?? []);
  await ensureMusclesExist(allMuscles);
  await ensureMuscleCombosExist(withImages.map((v) => v.muscles ?? []));
  await recordProgramVersionForExercise(
    exerciseId,
    "ai",
    `${withImages.length} variante${withImages.length > 1 ? "s" : ""} générée${withImages.length > 1 ? "s" : ""}`
  );
  return withImages.length;
}
