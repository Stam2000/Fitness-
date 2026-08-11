import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSettings } from "@/lib/settings";

// Réponse attendue du modèle : les muscles principaux de chaque mouvement.
const responseSchema = z.object({
  items: z
    .array(
      z.object({
        id: z.string(),
        muscles: z.array(z.string().min(1)).max(6),
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

// Rattrapage : annote les muscles travaillés des exercices (et variantes)
// d'un programme existant qui n'en ont pas encore.
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

  const program = await prisma.program.findUnique({
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
  if (!program) {
    return NextResponse.json({ error: "Programme introuvable" }, { status: 404 });
  }

  // Un même mouvement peut être un exercice ou une variante : on aplatit.
  const pending: { kind: "exercise" | "variation"; id: string; name: string }[] =
    [];
  for (const day of program.days) {
    for (const ex of day.exercises) {
      if (ex.muscles.length === 0) {
        pending.push({ kind: "exercise", id: ex.id, name: ex.name });
      }
      for (const v of ex.variations) {
        if (v.muscles.length === 0) {
          pending.push({ kind: "variation", id: v.id, name: v.name });
        }
      }
    }
  }
  if (pending.length === 0) {
    return NextResponse.json({ updated: 0 });
  }

  const prompt = `Pour chaque exercice de musculation/fitness ci-dessous, liste ses muscles principaux réellement sollicités (1 à 4), en français, avec des noms courts et cohérents (ex. "Dos", "Biceps", "Pectoraux", "Épaules", "Quadriceps", "Ischio-jambiers", "Fessiers", "Abdominaux", "Mollets", "Triceps", "Cardio").

Exercices :
${pending.map((p) => `- id "${p.id}" : ${p.name}`).join("\n")}

Réponds UNIQUEMENT avec un objet JSON :
{"items": [{"id": "…", "muscles": ["…", "…"]}]}
Un élément par exercice listé, avec son id exact.`;

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
        temperature: 0.2,
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
    const byId = new Map(parsed.items.map((i) => [i.id, i.muscles]));

    let updated = 0;
    await prisma.$transaction(async (tx) => {
      for (const p of pending) {
        const muscles = byId.get(p.id);
        if (!muscles || muscles.length === 0) continue;
        if (p.kind === "exercise") {
          await tx.exercise.update({ where: { id: p.id }, data: { muscles } });
        } else {
          await tx.exerciseVariation.update({
            where: { id: p.id },
            data: { muscles },
          });
        }
        updated++;
      }
    });
    return NextResponse.json({ updated });
  } catch (e) {
    console.error("muscles:", e);
    return NextResponse.json(
      { error: "Le modèle n'a pas renvoyé d'annotation exploitable. Réessaie." },
      { status: 502 }
    );
  }
}
