import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSettings } from "@/lib/settings";
import { requireApiUser } from "@/lib/session";
import { activeVariationIndex } from "@/lib/variants";

const warmupSchema = z.object({
  moves: z
    .array(
      z.object({
        name: z.string().min(1),
        seconds: z.number().int().min(10).max(180),
      })
    )
    .min(2)
    .max(8),
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

// Génère un échauffement ciblé (~5 min) pour la séance.
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireApiUser();
  if (user instanceof NextResponse) return user;
  const { id } = await params;
  const settings = await getSettings();
  if (!settings.openrouterApiKey) {
    return NextResponse.json(
      { error: "Aucune clé OpenRouter configurée (Réglages)." },
      { status: 400 }
    );
  }

  const session = await prisma.workoutSession.findFirst({
    where: { id, userId: user.id },
    include: {
      day: {
        include: {
          exercises: {
            orderBy: { order: "asc" },
            include: { variations: { orderBy: { order: "asc" } } },
          },
        },
      },
    },
  });
  // Sans jour vivant (programme supprimé), il n'y a plus de séance à préparer.
  if (!session?.day) {
    return NextResponse.json({ error: "Séance introuvable" }, { status: 404 });
  }
  const day = session.day;

  // L'échauffement cible les mouvements réellement joués cette séance
  // (variante active plutôt que l'exercice de base le cas échéant).
  const plannedNames = day.exercises.map((ex) => {
    const idx = activeVariationIndex(session, ex);
    return idx === 0 ? ex.name : ex.variations[idx - 1].name;
  });

  const prompt = `Séance à venir : « ${day.name} »${day.focus ? ` (${day.focus})` : ""}.
Exercices prévus : ${plannedNames.join(", ")}.

Propose un échauffement ciblé d'environ 5 minutes, sans matériel, préparant spécifiquement les muscles et articulations sollicités. Réponds UNIQUEMENT avec un objet JSON :
{"moves": [{"name": "nom du mouvement en français", "seconds": 45}]}
4 à 6 mouvements, 30 à 90 secondes chacun.`;

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
    const warmup = warmupSchema.parse(extractJson(content));
    return NextResponse.json(warmup);
  } catch (e) {
    console.error("warmup:", e);
    return NextResponse.json(
      { error: "Impossible de générer l'échauffement. Réessaie." },
      { status: 502 }
    );
  }
}
