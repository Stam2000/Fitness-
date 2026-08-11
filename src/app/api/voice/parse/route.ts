import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSettings } from "@/lib/settings";

const requestSchema = z
  .object({
    // Mode texte : phrase déjà transcrite par le navigateur.
    transcript: z.string().min(1).max(1000).optional(),
    // Mode audio : enregistrement WAV base64, écouté par le modèle vocal.
    audio: z.string().min(100).max(4_000_000).optional(),
    // Contexte optionnel pour aider le modèle à interpréter.
    exercise: z.string().max(200).optional(),
    targetReps: z.string().max(50).optional(),
    // Nombre de séries prescrites et n° (1-based) de la série en cours :
    // permet d'interpréter « toutes les séries » ou « la deuxième ».
    setCount: z.number().int().min(1).max(20).optional(),
    currentSet: z.number().int().min(1).max(20).optional(),
  })
  .refine((d) => d.transcript || d.audio, {
    message: "transcript ou audio requis",
  });

const setSchema = z.object({
  // 1-based ; null = position non précisée par l'utilisateur.
  set: z.number().int().min(1).max(20).nullable().default(null),
  weightKg: z.number().min(0).max(2000).nullable().default(null),
  reps: z.number().int().min(0).max(1000).nullable().default(null),
});

const responseSchema = z.object({
  // Compat : première série interprétée (anciens clients).
  weightKg: z.number().min(0).max(2000).nullable().default(null),
  reps: z.number().int().min(0).max(1000).nullable().default(null),
  sets: z.array(setSchema).max(20).default([]),
  // « toutes les séries à 60 kilos » : applique l'unique entrée partout.
  allSets: z.boolean().default(false),
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
// répétitions », « toutes les séries à 60 kilos : 12, 10, 9, 8 ») en une liste
// de séries. Le client garde un repli local (regex) si cette route échoue.
export async function POST(req: NextRequest) {
  const body = requestSchema.safeParse(await req.json().catch(() => null));
  if (!body.success) {
    return NextResponse.json({ error: "Requête invalide" }, { status: 400 });
  }
  const { transcript, audio, exercise, targetReps, setCount, currentSet } =
    body.data;

  const settings = await getSettings();
  if (!settings.openrouterApiKey) {
    return NextResponse.json(
      { error: "Aucune clé OpenRouter configurée (Réglages)." },
      { status: 400 }
    );
  }

  const context = [
    exercise
      ? `Exercice en cours : ${exercise}${targetReps ? ` (objectif ${targetReps} répétitions)` : ""}`
      : null,
    setCount ? `L'exercice compte ${setCount} séries.` : null,
    currentSet ? `Série en cours : n° ${currentSet}.` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const rules = `Extrais les séries décrites : pour chacune, le poids utilisé (en kg) et le nombre de répétitions effectuées.
Règles :
- Les nombres peuvent être en toutes lettres (« soixante-deux ») ou en chiffres.
- « et demi » / « virgule cinq » → +0,5 sur le poids.
- Une seule série décrite → un seul élément dans "sets", avec "set" à null si aucune position n'est précisée.
- Plusieurs séries décrites (« 12, 10, 9 puis 8 », « première série 60 kilos 10 reps, deuxième 60 kilos 8 ») → un élément par série, dans l'ordre énoncé. Renseigne "set" (numéro 1-based) UNIQUEMENT si l'utilisateur le précise (« la deuxième série… ») ; sinon null.
- Un poids annoncé une fois pour plusieurs séries s'applique à chacune : recopie-le dans chaque élément.
- « toutes les séries à X kilos pour Y reps » (une seule valeur pour tout l'exercice) → "allSets": true avec UN seul élément dans "sets".
- Si un poids manque (poids du corps, non mentionné), mets "weightKg" à null ; si des répétitions manquent, "reps" à null.
- Si la phrase n'a aucun rapport avec une performance, renvoie "sets": [].

Réponds UNIQUEMENT avec un objet JSON :
{"sets": [{"set": entier ou null, "weightKg": nombre ou null, "reps": entier ou null}], "allSets": booléen}`;

  // Mode audio : le modèle vocal écoute l'enregistrement lui-même ;
  // mode texte : le modèle par défaut interprète la transcription.
  const userContent = audio
    ? [
        {
          type: "text",
          text: `Écoute cette phrase dictée en français pendant une séance de musculation.
${context}

${rules}`,
        },
        {
          type: "input_audio",
          input_audio: { data: audio, format: "wav" },
        },
      ]
    : `Phrase dictée pendant une séance de musculation : « ${transcript} »
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
    // Un modèle peut ne renvoyer que l'ancien format { weightKg, reps } :
    // on le normalise en une série unique.
    const sets =
      parsed.sets.length > 0
        ? parsed.sets
        : parsed.weightKg !== null || parsed.reps !== null
          ? [{ set: null, weightKg: parsed.weightKg, reps: parsed.reps }]
          : [];
    return NextResponse.json({
      weightKg: sets[0]?.weightKg ?? null,
      reps: sets[0]?.reps ?? null,
      sets,
      allSets: parsed.allSets && sets.length === 1,
    });
  } catch (e) {
    console.error("voice-parse:", e);
    return NextResponse.json(
      { error: "Interprétation impossible." },
      { status: 502 }
    );
  }
}
