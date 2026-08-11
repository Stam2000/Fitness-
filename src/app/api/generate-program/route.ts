import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSettings } from "@/lib/settings";
import { programDraftSchema } from "@/lib/program-schema";
import {
  CREATIVITY_LEVELS,
  creativityInstruction,
  knownExercisesBlock,
  PROGRAM_SYSTEM_PROMPT,
} from "@/lib/program-prompt";
import {
  getKnownExercises,
  knownExerciseLines,
  resolveKnownRefs,
} from "@/lib/known-exercises";
import {
  getKnownMuscles,
  knownMusclesBlock,
  resolveDraftMuscles,
} from "@/lib/known-muscles";

const requestSchema = z.object({
  locationId: z.string(),
  goal: z.string(),
  level: z.string(),
  daysPerWeek: z.number().int().min(1).max(7),
  sessionMinutes: z.number().int().min(15).max(180),
  notes: z.string().optional(),
  // Modèle choisi pour cette génération ; sinon celui des Réglages.
  model: z.string().trim().min(1).max(120).optional(),
  // Réutiliser les exercices déjà en base vs en inventer de nouveaux.
  creativity: z.enum(CREATIVITY_LEVELS).default("normal"),
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

export async function POST(req: NextRequest) {
  const body = requestSchema.safeParse(await req.json());
  if (!body.success) {
    return NextResponse.json({ error: "Requête invalide" }, { status: 400 });
  }
  const {
    locationId,
    goal,
    level,
    daysPerWeek,
    sessionMinutes,
    notes,
    model,
    creativity,
  } = body.data;

  const settings = await getSettings();
  const selectedModel = model ?? settings.openrouterModel;
  if (!settings.openrouterApiKey) {
    return NextResponse.json(
      {
        error:
          "Aucune clé OpenRouter configurée. Ajoute ta clé dans Réglages pour générer un programme.",
      },
      { status: 400 }
    );
  }

  const [location, known, knownMuscles] = await Promise.all([
    prisma.location.findUnique({
      where: { id: locationId },
      include: { equipment: { include: { equipment: true } } },
    }),
    getKnownExercises(),
    getKnownMuscles(),
  ]);
  const knownLines = knownExerciseLines(known);
  if (!location) {
    return NextResponse.json({ error: "Contexte introuvable" }, { status: 404 });
  }
  const equipmentNames = location.equipment.map((e) => e.equipment.name);

  const systemPrompt = PROGRAM_SYSTEM_PROMPT;

  const userPrompt = `Crée un programme :
- Contexte : ${location.name}
- Équipement disponible : ${equipmentNames.length > 0 ? equipmentNames.join(", ") : "aucun (poids du corps uniquement)"}
- Objectif : ${goal}
- Niveau : ${level}
- Séances par semaine : ${daysPerWeek}
- Durée par séance : environ ${sessionMinutes} minutes
${notes ? `- Précisions de l'utilisateur : ${notes}` : ""}${
    knownLines.length > 0
      ? `

${creativityInstruction(creativity)}

${knownExercisesBlock(knownLines)}`
      : ""
  }${knownMuscles.length > 0 ? `\n\n${knownMusclesBlock(knownMuscles)}` : ""}`;

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
        model: selectedModel,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.7,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      let message = `Erreur OpenRouter (${res.status}) avec le modèle « ${selectedModel} »`;
      try {
        const parsed = JSON.parse(errText);
        if (parsed?.error?.message) message += ` : ${parsed.error.message}`;
      } catch {
        // corps non JSON, on garde le message générique
      }
      return NextResponse.json({ error: message }, { status: 502 });
    }

    const json = await res.json();
    const content: string | undefined = json?.choices?.[0]?.message?.content;
    if (!content) {
      return NextResponse.json(
        { error: "Réponse vide du modèle. Réessaie ou change de modèle." },
        { status: 502 }
      );
    }

    const draft = programDraftSchema.parse(extractJson(content));
    resolveKnownRefs(draft, known);
    resolveDraftMuscles(draft, knownMuscles);
    return NextResponse.json({ draft });
  } catch (e) {
    console.error("generate-program:", e);
    return NextResponse.json(
      {
        error:
          "Le modèle n'a pas renvoyé un programme exploitable. Réessaie ou choisis un autre modèle dans Réglages.",
      },
      { status: 502 }
    );
  }
}
