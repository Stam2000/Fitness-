import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSettings } from "@/lib/settings";
import { requireApiUser } from "@/lib/session";

const requestSchema = z.object({
  // true = régénérer même si une description existe déjà.
  force: z.boolean().optional(),
});

// Renvoie la description détaillée d'exécution d'un exercice ; la génère via
// l'IA au premier appel puis la mémorise (les appels suivants sont gratuits).
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireApiUser();
  if (user instanceof NextResponse) return user;
  const { id } = await params;
  const body = requestSchema.safeParse(await req.json().catch(() => ({})));
  if (!body.success) {
    return NextResponse.json({ error: "Requête invalide" }, { status: 400 });
  }

  const exercise = await prisma.exercise.findFirst({
    where: { id, day: { program: { userId: user.id } } },
    include: { day: { include: { program: true } } },
  });
  if (!exercise) {
    return NextResponse.json({ error: "Exercice introuvable" }, { status: 404 });
  }
  if (exercise.howTo && !body.data.force) {
    return NextResponse.json({ howTo: exercise.howTo });
  }

  const settings = await getSettings();
  if (!settings.openrouterApiKey) {
    return NextResponse.json(
      { error: "Aucune clé OpenRouter configurée (Réglages)." },
      { status: 400 }
    );
  }

  const program = exercise.day.program;
  const prompt = `Décris l'exécution de l'exercice « ${exercise.name} » (${exercise.sets} × ${exercise.reps}${exercise.equipment.length > 0 ? `, matériel : ${exercise.equipment.join(", ")}` : ", au poids du corps"}) pour un pratiquant de niveau ${program.level ?? "intermédiaire"}${exercise.muscles.length > 0 ? `. Muscles ciblés : ${exercise.muscles.join(", ")}` : ""}.

Structure ta réponse EXACTEMENT ainsi (texte simple, PAS de markdown — ni **, ni #) :
🎯 Position de départ
(2-3 phrases)

🏋️ Exécution
1. …
2. …
3. …

🫁 Respiration
(1-2 phrases)

⚠️ Erreurs fréquentes
- …
- …

💡 Conseil
(1 phrase)

Sois concret et précis (angles, appuis, trajectoire), 150 à 250 mots au total, en français.`;

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
              "Tu es un coach sportif expert et pédagogue. Tu réponds en français, en texte simple sans markdown.",
          },
          { role: "user", content: prompt },
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
    if (!content || content.trim().length < 40) {
      return NextResponse.json(
        { error: "Réponse vide du modèle. Réessaie." },
        { status: 502 }
      );
    }
    const howTo = content.trim();
    await prisma.exercise.update({ where: { id }, data: { howTo } });
    return NextResponse.json({ howTo });
  } catch (e) {
    console.error("exercise description:", e);
    return NextResponse.json(
      { error: "La génération de la description a échoué. Réessaie." },
      { status: 502 }
    );
  }
}
