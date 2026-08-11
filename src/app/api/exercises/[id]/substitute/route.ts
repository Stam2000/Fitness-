import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { AiError } from "@/lib/openrouter";
import { applySubstitute, generateSubstitute } from "@/lib/ai-exercise";

const requestSchema = z.object({
  reason: z.string().max(300).optional(),
});

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

  try {
    const { replacement } = await generateSubstitute(id, body.data.reason);
    const updated = await applySubstitute(id, replacement);
    return NextResponse.json({ exercise: updated });
  } catch (e) {
    if (e instanceof AiError) {
      return NextResponse.json({ error: e.userMessage }, { status: e.status });
    }
    console.error("substitute:", e);
    return NextResponse.json(
      { error: "Le modèle n'a pas proposé d'alternative exploitable. Réessaie." },
      { status: 502 }
    );
  }
}
