import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSettings } from "@/lib/settings";
import { variationSchema } from "@/lib/program-schema";
import {
  getKnownExercises,
  knownExerciseLines,
  resolveKnownRef,
} from "@/lib/known-exercises";
import { knownExercisesBlock } from "@/lib/program-prompt";
import {
  ensureMuscleCombosExist,
  ensureMusclesExist,
  getKnownMuscles,
  knownMusclesBlock,
  resolveMuscleNames,
} from "@/lib/known-muscles";
import { findExistingImageByName } from "@/lib/exercise-images";

const responseSchema = z.object({
  variations: z.array(variationSchema).min(1).max(2),
});

function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("Pas de JSON dans la réponse");
  }
  return JSON.parse(candidate.slice(start, end + 1));
}

// Génère 2 exercices alternatifs (mêmes muscles) pour un exercice, en
// piochant de préférence dans le catalogue des exercices déjà connus, et les
// enregistre comme variantes jouées en rotation. Remplace les variantes
// existantes (l'historique des variantes reste retrouvé par nom).
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const settings = await getSettings();
  if (!settings.openrouterApiKey) {
    return NextResponse.json(
      { error: "Aucune clé OpenRouter configurée (Réglages)." },
      { status: 400 }
    );
  }

  const exercise = await prisma.exercise.findUnique({
    where: { id },
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
    return NextResponse.json({ error: "Exercice introuvable" }, { status: 404 });
  }

  const program = exercise.day.program;
  const [known, knownMuscles] = await Promise.all([
    getKnownExercises(),
    getKnownMuscles(),
  ]);
  const knownLines = knownExerciseLines(known);
  const equipmentNames =
    program.location?.equipment.map((e) => e.equipment.name) ?? [];
  const otherNames = exercise.day.exercises
    .filter((e) => e.id !== id)
    .map((e) => e.name);

  const prompt = `Dans la séance « ${exercise.day.name} » (objectif : ${program.goal ?? "non précisé"}, niveau : ${program.level ?? "non précisé"}), propose 2 exercices ALTERNATIFS à celui-ci, ciblant EXACTEMENT les mêmes muscles, pour être joués en rotation certaines semaines à sa place (varier les stimuli) :
- ${exercise.name} : ${exercise.sets} × ${exercise.reps}, repos ${exercise.restSeconds}s${exercise.muscles.length > 0 ? ` — muscles : ${exercise.muscles.join(", ")}` : ""}

Équipement disponible : ${equipmentNames.length > 0 ? equipmentNames.join(", ") : "poids du corps uniquement"} — utilise EXCLUSIVEMENT cet équipement ; combine librement plusieurs équipements et liste dans "equipment" TOUTES les pièces utilisées.
Ne propose NI l'exercice lui-même, NI un exercice déjà présent dans la séance : ${otherNames.join(", ") || "aucun"}.
${knownLines.length > 0 ? `\n${knownExercisesBlock(knownLines)}\n` : ""}${knownMuscles.length > 0 ? `\n${knownMusclesBlock(knownMuscles)}\n` : ""}
Réponds UNIQUEMENT avec un objet JSON :
{"variations": [{"name": "…", "sets": ${exercise.sets}, "reps": "…", "restSeconds": ${exercise.restSeconds}, "weightHint": "…", "equipment": ["…"], "muscles": ["…"], "targetSeconds": 360, "setSeconds": 45, "notes": "conseil court"}]}
("targetSeconds" = temps cible toutes séries et repos compris ; "setSeconds" = temps d'exécution d'UNE série.)`;

  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${settings.openrouterApiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://github.com/Stam2000/fitness-",
        "X-Title": "Mon Coach Fitness",
      },
      body: JSON.stringify({
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
      }),
    });
    if (!res.ok) {
      return NextResponse.json(
        { error: `Erreur OpenRouter (${res.status})` },
        { status: 502 }
      );
    }
    const json = await res.json();
    const content: string | undefined = json?.choices?.[0]?.message?.content;
    if (!content) {
      return NextResponse.json(
        { error: "Réponse vide du modèle." },
        { status: 502 }
      );
    }
    const parsed = responseSchema.parse(extractJson(content));

    // Résolutions (références #n, muscles canoniques) + écarter un éventuel
    // doublon de l'exercice de base malgré la consigne.
    const variations = parsed.variations.filter((v) => {
      resolveKnownRef(v, known);
      v.muscles = resolveMuscleNames(v.muscles, knownMuscles);
      return v.name.trim().toLowerCase() !== exercise.name.trim().toLowerCase();
    });
    if (variations.length === 0) {
      return NextResponse.json(
        { error: "Le modèle n'a pas proposé d'alternative exploitable. Réessaie." },
        { status: 502 }
      );
    }

    // Une image existe déjà pour ce mouvement ? On la réutilise directement.
    const withImages = await Promise.all(
      variations.map(async (v) => ({
        ...v,
        imageUrl: await findExistingImageByName(v.name),
      }))
    );

    await prisma.$transaction(async (tx) => {
      await tx.exerciseVariation.deleteMany({ where: { exerciseId: id } });
      for (let i = 0; i < withImages.length; i++) {
        const v = withImages[i];
        await tx.exerciseVariation.create({
          data: {
            exerciseId: id,
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

    return NextResponse.json({ count: withImages.length });
  } catch (e) {
    console.error("exercise variations:", e);
    return NextResponse.json(
      { error: "La génération des variantes a échoué. Réessaie." },
      { status: 502 }
    );
  }
}
