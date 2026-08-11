import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSettings } from "@/lib/settings";

const requestSchema = z
  .object({
    // Mode texte : phrase déjà transcrite par le navigateur.
    transcript: z.string().min(1).max(300).optional(),
    // Mode audio : enregistrement WAV base64, écouté par le modèle vocal.
    audio: z.string().min(100).max(4_000_000).optional(),
    // Contexte optionnel pour aider le modèle à interpréter.
    exercise: z.string().max(200).optional(),
    targetReps: z.string().max(50).optional(),
  })
  .refine((d) => d.transcript || d.audio, {
    message: "transcript ou audio requis",
  });

const responseSchema = z.object({
  weightKg: z.number().min(0).max(2000).nullable(),
  reps: z.number().int().min(0).max(1000).nullable(),
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

// Interprète une phrase dictée pendant la séance (« 62 kilos et demi, onze
// répétitions ») en { weightKg, reps } via le modèle OpenRouter configuré.
// Le client garde un repli local (regex) si cette route échoue.
export async function POST(req: NextRequest) {
  const body = requestSchema.safeParse(await req.json().catch(() => null));
  if (!body.success) {
    return NextResponse.json({ error: "Requête invalide" }, { status: 400 });
  }
  const { transcript, audio, exercise, targetReps } = body.data;

  const settings = await getSettings();
  if (!settings.openrouterApiKey) {
    return NextResponse.json(
      { error: "Aucune clé OpenRouter configurée (Réglages)." },
      { status: 400 }
    );
  }

  const context = exercise
    ? `Exercice en cours : ${exercise}${targetReps ? ` (objectif ${targetReps} répétitions)` : ""}`
    : "";
  const rules = `Extrais le poids utilisé (en kg) et le nombre de répétitions effectuées.
Règles :
- Les nombres peuvent être en toutes lettres (« soixante-deux ») ou en chiffres.
- « et demi » / « virgule cinq » → +0,5 sur le poids.
- Si seul un poids est mentionné, "reps" = null ; si seules des répétitions sont mentionnées, "weightKg" = null.
- Exercice au poids du corps ou sans charge mentionnée : "weightKg" = null.
- Si la phrase n'a aucun rapport avec une performance, renvoie les deux à null.

Réponds UNIQUEMENT avec un objet JSON : {"weightKg": nombre ou null, "reps": entier ou null}`;

  // Mode audio : le modèle vocal écoute l'enregistrement lui-même ;
  // mode texte : le modèle par défaut interprète la transcription.
  const userContent = audio
    ? [
        {
          type: "text",
          text: `Écoute cette phrase dictée en français pendant une série de musculation.
${context}

${rules}`,
        },
        {
          type: "input_audio",
          input_audio: { data: audio, format: "wav" },
        },
      ]
    : `Phrase dictée pendant une série de musculation : « ${transcript} »
${context}

${rules}`;

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
        model: audio ? settings.voiceModel : settings.openrouterModel,
        messages: [
          {
            role: "system",
            content:
              "Tu extrais des données d'entraînement dictées en français. Tu réponds uniquement en JSON valide.",
          },
          { role: "user", content: userContent },
        ],
        temperature: 0,
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
    return NextResponse.json(parsed);
  } catch (e) {
    console.error("voice-parse:", e);
    return NextResponse.json(
      { error: "Interprétation impossible." },
      { status: 502 }
    );
  }
}
