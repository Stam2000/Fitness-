import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSettings } from "@/lib/settings";
import { programDraftSchema } from "@/lib/program-schema";

const requestSchema = z.object({
  locationId: z.string(),
  goal: z.string(),
  level: z.string(),
  daysPerWeek: z.number().int().min(1).max(7),
  sessionMinutes: z.number().int().min(15).max(180),
  notes: z.string().optional(),
  // Modèle choisi pour cette génération ; sinon celui des Réglages.
  model: z.string().trim().min(1).max(120).optional(),
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
  const { locationId, goal, level, daysPerWeek, sessionMinutes, notes, model } =
    body.data;

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

  const location = await prisma.location.findUnique({
    where: { id: locationId },
    include: { equipment: { include: { equipment: true } } },
  });
  if (!location) {
    return NextResponse.json({ error: "Contexte introuvable" }, { status: 404 });
  }
  const equipmentNames = location.equipment.map((e) => e.equipment.name);

  const systemPrompt = `Tu es un coach sportif expert. Tu crées des programmes de musculation/fitness personnalisés en français.
Tu réponds UNIQUEMENT avec un objet JSON valide, sans texte avant ou après, respectant exactement ce schéma :
{
  "name": "nom court du programme",
  "description": "description en 1-2 phrases",
  "days": [
    {
      "name": "Jour 1 — Nom de la séance",
      "focus": "groupes musculaires ciblés",
      "exercises": [
        {
          "name": "nom de l'exercice en français",
          "sets": 4,
          "reps": "8-12",
          "restSeconds": 90,
          "weightHint": "conseil de charge (ex. 60-70% 1RM, ou 'modéré')",
          "equipment": ["équipement utilisé parmi la liste fournie"],
          "muscles": ["Dos", "Biceps"],
          "notes": "conseil de technique court ou null",
          "variations": [
            {
              "name": "exercice alternatif ciblant les mêmes muscles",
              "sets": 4,
              "reps": "8-10",
              "restSeconds": 120,
              "weightHint": "conseil de charge",
              "equipment": ["équipement utilisé parmi la liste fournie"],
              "muscles": ["muscles principaux travaillés"],
              "notes": "conseil de technique court ou null"
            }
          ]
        }
      ]
    }
  ]
}
Règles :
- Utilise EXCLUSIVEMENT l'équipement listé (ou le poids du corps si la liste est vide ou insuffisante).
- Le nombre de jours doit correspondre exactement à la demande.
- Adapte le volume à la durée de séance demandée (échauffement compris).
- "reps" est une chaîne : "8-12", "10", "30 s", "jusqu'à l'échec"…
- "muscles" : 1 à 4 muscles principaux réellement sollicités, en français, noms courts et cohérents d'un exercice à l'autre (ex. "Dos", "Biceps", "Pectoraux", "Épaules", "Quadriceps", "Ischio-jambiers", "Fessiers", "Abdominaux", "Mollets", "Triceps", "Cardio").
- "restSeconds" entre 30 et 240 selon l'intensité.
- "variations" : 0 à 2 exercices ALTERNATIFS ciblant EXACTEMENT les mêmes muscles que l'exercice de base, joués certaines semaines à sa place pour varier les stimuli.
- Ne propose une variation QUE si l'équipement listé permet une alternative réellement différente et pertinente ; sinon "variations": [].
- Une variation utilise elle aussi exclusivement l'équipement listé.
- Si plusieurs objectifs sont indiqués (séparés par « + »), conçois le programme pour les concilier équitablement (choix d'exercices, fourchettes de reps, temps de repos, cardio/finishers si pertinent).`;

  const userPrompt = `Crée un programme :
- Contexte : ${location.name}
- Équipement disponible : ${equipmentNames.length > 0 ? equipmentNames.join(", ") : "aucun (poids du corps uniquement)"}
- Objectif : ${goal}
- Niveau : ${level}
- Séances par semaine : ${daysPerWeek}
- Durée par séance : environ ${sessionMinutes} minutes
${notes ? `- Précisions de l'utilisateur : ${notes}` : ""}`;

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
