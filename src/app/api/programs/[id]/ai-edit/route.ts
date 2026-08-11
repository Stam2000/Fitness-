import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { AiError } from "@/lib/openrouter";
import { generateProgramEditDraft } from "@/lib/ai-program-edit";

const requestSchema = z.object({
  instructions: z.string().min(3).max(2000),
});

// Modifie un programme existant selon des instructions en langage naturel.
// Renvoie un brouillon (avec les ids des éléments conservés) SANS le
// sauvegarder : l'utilisateur relit dans l'éditeur puis updateProgram
// applique les changements en gardant l'historique des exercices conservés.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = requestSchema.safeParse(await req.json().catch(() => ({})));
  if (!body.success) {
    return NextResponse.json({ error: "Requête invalide" }, { status: 400 });
  }

  try {
    const draft = await generateProgramEditDraft(id, body.data.instructions);
    return NextResponse.json({ draft });
  } catch (e) {
    if (e instanceof AiError) {
      return NextResponse.json({ error: e.userMessage }, { status: e.status });
    }
    console.error("ai-edit:", e);
    return NextResponse.json(
      {
        error:
          "Le modèle n'a pas renvoyé un programme exploitable. Réessaie ou reformule la demande.",
      },
      { status: 502 }
    );
  }
}
