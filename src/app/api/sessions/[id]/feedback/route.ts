import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSettings } from "@/lib/settings";

function describeSession(
  exercises: {
    id: string;
    name: string;
    sets: number;
    reps: string;
    weightHint: string | null;
  }[],
  logs: {
    exerciseId: string;
    setIndex: number;
    reps: number | null;
    weightKg: number | null;
    done: boolean;
    variationName: string | null;
  }[]
): string {
  return exercises
    .map((ex) => {
      const exLogs = logs
        .filter((l) => l.exerciseId === ex.id)
        .sort((a, b) => a.setIndex - b.setIndex);
      const series = exLogs
        .map((l) =>
          l.done
            ? `${l.weightKg != null ? `${l.weightKg} kg` : "poids du corps"} × ${l.reps ?? "?"}`
            : "non faite"
        )
        .join(", ");
      // Le mouvement réellement exécuté (variante) prime sur l'exercice prévu.
      const name = exLogs.find((l) => l.variationName)?.variationName ?? ex.name;
      return `- ${name} (objectif ${ex.sets} × ${ex.reps}${ex.weightHint ? `, ${ex.weightHint}` : ""}) : ${series || "aucune série"}`;
    })
    .join("\n");
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await prisma.workoutSession.findUnique({
    where: { id },
    include: {
      setLogs: true,
      day: {
        include: {
          program: true,
          exercises: { orderBy: { order: "asc" } },
        },
      },
    },
  });
  if (!session) {
    return NextResponse.json({ error: "Séance introuvable" }, { status: 404 });
  }
  if (session.aiFeedback) {
    return NextResponse.json({ feedback: session.aiFeedback });
  }

  const settings = await getSettings();
  if (!settings.openrouterApiKey) {
    return NextResponse.json(
      {
        error:
          "Aucune clé OpenRouter configurée. Ajoute ta clé dans Réglages pour l'analyse du coach.",
      },
      { status: 400 }
    );
  }

  const previous = await prisma.workoutSession.findFirst({
    where: {
      dayId: session.dayId,
      completedAt: { not: null },
      id: { not: id },
    },
    orderBy: { completedAt: "desc" },
    include: { setLogs: true },
  });

  const current = describeSession(session.day.exercises, session.setLogs);
  const prev = previous
    ? describeSession(session.day.exercises, previous.setLogs)
    : null;

  const prompt = `Séance « ${session.day.name} » du programme « ${session.day.program.name} » (objectif : ${session.day.program.goal ?? "non précisé"}, niveau : ${session.day.program.level ?? "non précisé"}).

Séance d'aujourd'hui :
${current}
${prev ? `\nSéance précédente (même jour de programme) :\n${prev}` : "\nC'était la première séance sur ce jour de programme."}

Donne un feedback de coach en français : 1 phrase d'encouragement concrète, puis 2 à 4 puces courtes avec des conseils actionnables (charges à ajuster précisément, séries manquées, équilibre, récupération). Maximum 120 mots, pas de titre.`;

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
              "Tu es un coach sportif expérimenté, direct et bienveillant. Tu réponds en français, de façon concise.",
          },
          { role: "user", content: prompt },
        ],
        temperature: 0.6,
        max_tokens: 400,
      }),
    });
    if (!res.ok) {
      return NextResponse.json(
        { error: `Erreur OpenRouter (${res.status})` },
        { status: 502 }
      );
    }
    const json = await res.json();
    const feedback: string | undefined =
      json?.choices?.[0]?.message?.content?.trim();
    if (!feedback) {
      return NextResponse.json(
        { error: "Réponse vide du modèle." },
        { status: 502 }
      );
    }
    await prisma.workoutSession.update({
      where: { id },
      data: { aiFeedback: feedback },
    });
    return NextResponse.json({ feedback });
  } catch (e) {
    console.error("session feedback:", e);
    return NextResponse.json(
      { error: "Impossible de joindre le coach IA. Réessaie plus tard." },
      { status: 502 }
    );
  }
}
