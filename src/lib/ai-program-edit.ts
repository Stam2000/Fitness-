import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSettings } from "@/lib/settings";
import { AiError, chatCompletionText, extractJson } from "@/lib/openrouter";
import {
  getKnownExercises,
  knownExerciseLines,
  resolveKnownRef,
} from "@/lib/known-exercises";
import { knownExercisesBlock } from "@/lib/program-prompt";
import {
  getKnownMuscles,
  knownMusclesBlock,
  resolveMuscleNames,
} from "@/lib/known-muscles";

// Programme modifié attendu du modèle : mêmes champs que le draft, plus les
// ids d'origine sur les jours/exercices conservés (c'est ce qui préserve
// l'historique de séances via updateProgram).
const editedExerciseSchema = z.object({
  id: z.string().nullish(),
  name: z.string().min(1),
  sets: z.number().int().min(1).max(12),
  reps: z.string().min(1),
  restSeconds: z.number().int().min(0).max(600),
  weightHint: z.string().nullish(),
  equipment: z.array(z.string()).default([]),
  muscles: z.array(z.string().min(1)).max(6).default([]),
  targetSeconds: z.number().int().min(30).max(3600).nullish(),
  setSeconds: z.number().int().min(10).max(600).nullish(),
  transitionSeconds: z.number().int().min(0).max(600).nullish(),
  notes: z.string().nullish(),
});
export const editedProgramSchema = z.object({
  name: z.string().min(1),
  description: z.string().nullish(),
  days: z
    .array(
      z.object({
        id: z.string().nullish(),
        name: z.string().min(1),
        focus: z.string().nullish(),
        exercises: z.array(editedExerciseSchema).min(1),
      })
    )
    .min(1),
});

export type EditedProgramDraft = z.infer<typeof editedProgramSchema>;

// Garde-fous sur les ids d'un brouillon : un id doit exister dans CE programme
// (et un exercice dans SON jour d'origine), sans doublon — sinon on le retire
// et l'élément est traité comme nouveau. Renvoie le nombre d'ids retirés :
// > 0 à l'application d'une proposition = programme modifié entre-temps.
export async function sanitizeDraftIds(
  programId: string,
  draft: EditedProgramDraft
): Promise<number> {
  const program = await prisma.program.findUnique({
    where: { id: programId },
    include: { days: { include: { exercises: { select: { id: true } } } } },
  });
  if (!program) {
    throw new AiError("Programme introuvable", 404);
  }
  const validDayIds = new Set(program.days.map((d) => d.id));
  const exIdsByDay = new Map(
    program.days.map((d) => [d.id, new Set(d.exercises.map((e) => e.id))])
  );
  const seenDayIds = new Set<string>();
  const seenExIds = new Set<string>();
  let stripped = 0;
  for (const day of draft.days) {
    if (day.id && (!validDayIds.has(day.id) || seenDayIds.has(day.id))) {
      day.id = null;
      stripped++;
    }
    if (day.id) seenDayIds.add(day.id);
    const dayExIds = day.id ? exIdsByDay.get(day.id) : undefined;
    for (const ex of day.exercises) {
      if (ex.id && (!dayExIds?.has(ex.id) || seenExIds.has(ex.id))) {
        ex.id = null;
        stripped++;
      }
      if (ex.id) seenExIds.add(ex.id);
    }
  }
  return stripped;
}

// Modifie un programme existant selon des instructions en langage naturel.
// Renvoie un brouillon (avec les ids des éléments conservés) SANS le
// sauvegarder : l'utilisateur relit puis updateProgram applique les
// changements en gardant l'historique.
export async function generateProgramEditDraft(
  programId: string,
  instructions: string
): Promise<EditedProgramDraft> {
  const settings = await getSettings();
  if (!settings.openrouterApiKey) {
    throw new AiError("Aucune clé OpenRouter configurée (Réglages).", 400);
  }

  const program = await prisma.program.findUnique({
    where: { id: programId },
    include: {
      location: { include: { equipment: { include: { equipment: true } } } },
      days: {
        orderBy: { dayIndex: "asc" },
        include: { exercises: { orderBy: { order: "asc" } } },
      },
    },
  });
  if (!program) {
    throw new AiError("Programme introuvable", 404);
  }

  const [known, knownMuscles] = await Promise.all([
    getKnownExercises(),
    getKnownMuscles(),
  ]);
  const knownLines = knownExerciseLines(known);
  const equipmentNames =
    program.location?.equipment.map((e) => e.equipment.name) ?? [];

  const source = {
    name: program.name,
    description: program.description,
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
        setSeconds: ex.setSeconds,
        transitionSeconds: ex.transitionSeconds,
        notes: ex.notes,
      })),
    })),
  };

  const userPrompt = `Voici un programme existant (objectif : ${program.goal ?? "non précisé"}, niveau : ${program.level ?? "non précisé"}) :
${JSON.stringify(source, null, 2)}

Modifications demandées par l'utilisateur :
${instructions}

Applique UNIQUEMENT ces modifications et renvoie le programme COMPLET au même format JSON. Règles impératives :
- Tout ce qui n'est pas concerné par la demande reste STRICTEMENT identique (noms, séries, reps, repos, temps, notes…).
- Conserve le champ "id" de chaque jour et de chaque exercice gardé, même si tu modifies ses autres champs : l'historique d'entraînement en dépend. Omets "id" uniquement pour un jour ou un exercice réellement NOUVEAU.
- Un exercice déplacé d'un jour à un autre est traité comme nouveau : ne recopie pas son "id".
- Garde EXACTEMENT le même nom quand un exercice continue (progression et suggestions de charge retrouvées par nom). Ne renomme que si tu remplaces réellement le mouvement.
- Équipement disponible : ${equipmentNames.length > 0 ? equipmentNames.join(", ") : "aucun (poids du corps uniquement)"} — utilise EXCLUSIVEMENT cet équipement ; combine librement plusieurs équipements dans un même exercice quand c'est pertinent et liste dans "equipment" TOUTES les pièces utilisées.
- Pour un exercice nouveau, remplis "muscles", "targetSeconds", "setSeconds" et "transitionSeconds" comme pour une génération.
${knownLines.length > 0 ? `\n${knownExercisesBlock(knownLines)}\n` : ""}${knownMuscles.length > 0 ? `\n${knownMusclesBlock(knownMuscles)}\n` : ""}
Réponds UNIQUEMENT avec l'objet JSON du programme modifié.`;

  const content = await chatCompletionText({
    apiKey: settings.openrouterApiKey,
    model: settings.openrouterModel,
    messages: [
      {
        role: "system",
        content:
          "Tu es un coach sportif expert. Tu réponds uniquement avec un objet JSON valide, sans texte autour, en français.",
      },
      { role: "user", content: userPrompt },
    ],
    temperature: 0.4,
  });
  const draft = editedProgramSchema.parse(extractJson(content));

  await sanitizeDraftIds(programId, draft);
  for (const day of draft.days) {
    for (const ex of day.exercises) {
      // Résolutions : référence #n éventuelle + noms de muscles canoniques.
      resolveKnownRef(ex, known);
      ex.muscles = resolveMuscleNames(ex.muscles, knownMuscles);
    }
  }

  return draft;
}
