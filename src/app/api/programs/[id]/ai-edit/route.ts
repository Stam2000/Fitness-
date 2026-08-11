import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSettings } from "@/lib/settings";
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

const requestSchema = z.object({
  instructions: z.string().min(3).max(2000),
});

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
const editedProgramSchema = z.object({
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

// Modifie un programme existant selon des instructions en langage naturel.
// Renvoie un brouillon (avec les ids des éléments conservés) SANS le
// sauvegarder : l'utilisateur relit dans l'éditeur puis updateProgram
// applique les changements en gardant l'historique des exercices conservés.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = requestSchema.safeParse(await req.json().catch(() => ({})));
  if (!body.success) {
    return NextResponse.json({ error: "Requête invalide" }, { status: 400 });
  }

  const settings = await getSettings();
  if (!settings.openrouterApiKey) {
    return NextResponse.json(
      { error: "Aucune clé OpenRouter configurée (Réglages)." },
      { status: 400 }
    );
  }

  const program = await prisma.program.findUnique({
    where: { id },
    include: {
      location: { include: { equipment: { include: { equipment: true } } } },
      days: {
        orderBy: { dayIndex: "asc" },
        include: { exercises: { orderBy: { order: "asc" } } },
      },
    },
  });
  if (!program) {
    return NextResponse.json(
      { error: "Programme introuvable" },
      { status: 404 }
    );
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
${body.data.instructions}

Applique UNIQUEMENT ces modifications et renvoie le programme COMPLET au même format JSON. Règles impératives :
- Tout ce qui n'est pas concerné par la demande reste STRICTEMENT identique (noms, séries, reps, repos, temps, notes…).
- Conserve le champ "id" de chaque jour et de chaque exercice gardé, même si tu modifies ses autres champs : l'historique d'entraînement en dépend. Omets "id" uniquement pour un jour ou un exercice réellement NOUVEAU.
- Un exercice déplacé d'un jour à un autre est traité comme nouveau : ne recopie pas son "id".
- Garde EXACTEMENT le même nom quand un exercice continue (progression et suggestions de charge retrouvées par nom). Ne renomme que si tu remplaces réellement le mouvement.
- Équipement disponible : ${equipmentNames.length > 0 ? equipmentNames.join(", ") : "aucun (poids du corps uniquement)"} — utilise EXCLUSIVEMENT cet équipement ; combine librement plusieurs équipements dans un même exercice quand c'est pertinent et liste dans "equipment" TOUTES les pièces utilisées.
- Pour un exercice nouveau, remplis "muscles", "targetSeconds", "setSeconds" et "transitionSeconds" comme pour une génération.
${knownLines.length > 0 ? `\n${knownExercisesBlock(knownLines)}\n` : ""}${knownMuscles.length > 0 ? `\n${knownMusclesBlock(knownMuscles)}\n` : ""}
Réponds UNIQUEMENT avec l'objet JSON du programme modifié.`;

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
              "Tu es un coach sportif expert. Tu réponds uniquement avec un objet JSON valide, sans texte autour, en français.",
          },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.4,
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
    const draft = editedProgramSchema.parse(extractJson(content));

    // Garde-fous sur les ids renvoyés : un id doit exister dans CE programme
    // (et un exercice dans SON jour d'origine), sans doublon — sinon on le
    // retire et l'élément est traité comme nouveau.
    const validDayIds = new Set(program.days.map((d) => d.id));
    const exIdsByDay = new Map(
      program.days.map((d) => [d.id, new Set(d.exercises.map((e) => e.id))])
    );
    const seenDayIds = new Set<string>();
    const seenExIds = new Set<string>();
    for (const day of draft.days) {
      if (day.id && (!validDayIds.has(day.id) || seenDayIds.has(day.id))) {
        day.id = null;
      }
      if (day.id) seenDayIds.add(day.id);
      const dayExIds = day.id ? exIdsByDay.get(day.id) : undefined;
      for (const ex of day.exercises) {
        if (ex.id && (!dayExIds?.has(ex.id) || seenExIds.has(ex.id))) {
          ex.id = null;
        }
        if (ex.id) seenExIds.add(ex.id);
        // Résolutions : référence #n éventuelle + noms de muscles canoniques.
        resolveKnownRef(ex, known);
        ex.muscles = resolveMuscleNames(ex.muscles, knownMuscles);
      }
    }

    return NextResponse.json({ draft });
  } catch (e) {
    console.error("ai-edit:", e);
    return NextResponse.json(
      {
        error:
          "Le modèle n'a pas renvoyé un programme exploitable. Réessaie ou reformule la demande.",
      },
      { status: 502 }
    );
  }
}
