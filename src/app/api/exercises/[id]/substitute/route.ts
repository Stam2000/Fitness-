import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSettings } from "@/lib/settings";
import { exerciseSchema } from "@/lib/program-schema";

const requestSchema = z.object({
  reason: z.string().max(300).optional(),
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

// Remplace un exercice par une alternative IA équivalente (l'exercice du
// programme est mis à jour en place ; son image est réinitialisée).
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
  const equipmentNames =
    program.location?.equipment.map((e) => e.equipment.name) ?? [];
  const otherNames = exercise.day.exercises
    .filter((e) => e.id !== id)
    .map((e) => e.name);

  const prompt = `Dans la séance « ${exercise.day.name} » (objectif : ${program.goal ?? "non précisé"}, niveau : ${program.level ?? "non précisé"}), je veux remplacer cet exercice :
- ${exercise.name} : ${exercise.sets} × ${exercise.reps}, repos ${exercise.restSeconds}s${exercise.weightHint ? `, ${exercise.weightHint}` : ""}
${body.data.reason ? `Raison : ${body.data.reason}` : ""}

Équipement disponible : ${equipmentNames.length > 0 ? equipmentNames.join(", ") : "poids du corps uniquement"}
Exercices déjà présents dans la séance (à ne PAS proposer) : ${otherNames.join(", ") || "aucun"}

Propose UN exercice de remplacement ciblant les mêmes muscles, adapté à la raison donnée. Réponds UNIQUEMENT avec un objet JSON :
{"name": "...", "sets": 4, "reps": "8-12", "restSeconds": 90, "weightHint": "..." , "equipment": ["..."], "muscles": ["1 à 4 muscles principaux, ex. Dos, Biceps"], "targetSeconds": 360, "setSeconds": 45, "notes": "conseil de technique court"}
("targetSeconds" = temps cible pour boucler l'exercice, toutes séries et repos compris ; "setSeconds" = temps cible d'exécution d'UNE série.)`;

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
    const replacement = exerciseSchema.parse(extractJson(content));

    // Le mouvement de base change : les anciennes variantes (alternatives de
    // l'ancien mouvement) n'ont plus de sens, on les supprime.
    const [updated] = await prisma.$transaction([
      prisma.exercise.update({
        where: { id },
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
      prisma.exerciseVariation.deleteMany({ where: { exerciseId: id } }),
    ]);
    return NextResponse.json({ exercise: updated });
  } catch (e) {
    console.error("substitute:", e);
    return NextResponse.json(
      { error: "Le modèle n'a pas proposé d'alternative exploitable. Réessaie." },
      { status: 502 }
    );
  }
}
