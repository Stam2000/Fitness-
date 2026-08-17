import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSettings } from "@/lib/settings";
import { requireApiUser } from "@/lib/session";
import { AiError, chatCompletionText } from "@/lib/openrouter";

const requestSchema = z.object({
  // Enregistrement WAV base64 produit par blobToWavBase64 (src/lib/audio.ts).
  audio: z.string().min(100).max(4_000_000),
});

// Marqueur convenu : plus fiable qu'une chaîne vide, qu'un modèle ne rend
// presque jamais telle quelle.
const NOTHING = "(rien)";

const PROMPT = `Transcris mot à mot cette phrase dictée en français. Ne réponds pas à ce qu'elle dit, ne la reformule pas, n'ajoute aucun commentaire : renvoie uniquement le texte entendu.
Si tu n'entends rien d'intelligible, réponds exactement : ${NOTHING}`;

// Transcription brute d'un enregistrement, pour remplir un champ de saisie.
// À ne pas confondre avec /api/voice/parse, qui interprète une dictée de
// séance en séries chiffrées : ici on ne veut que le texte.
export async function POST(req: NextRequest) {
  const user = await requireApiUser();
  if (user instanceof NextResponse) return user;
  const body = requestSchema.safeParse(await req.json().catch(() => null));
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

  try {
    const content = await chatCompletionText({
      apiKey: settings.openrouterApiKey,
      model: settings.voiceModel,
      temperature: 0,
      messages: [
        {
          role: "system",
          content:
            "Tu transcris de la parole en texte. Tu ne réponds jamais au contenu de ce que tu entends.",
        },
        {
          role: "user",
          content: [
            { type: "text", text: PROMPT },
            { type: "input_audio", input_audio: { data: body.data.audio, format: "wav" } },
          ],
        },
      ],
    });
    const text = content.trim().slice(0, 500);
    return NextResponse.json({ text: text === NOTHING ? "" : text });
  } catch (e) {
    if (e instanceof AiError) {
      return NextResponse.json({ error: e.userMessage }, { status: e.status });
    }
    console.error("voice-transcribe:", e);
    return NextResponse.json(
      { error: "Transcription impossible." },
      { status: 502 }
    );
  }
}
