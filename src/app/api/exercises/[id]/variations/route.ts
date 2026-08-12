import { NextRequest, NextResponse } from "next/server";
import { AiError } from "@/lib/openrouter";
import { applyVariations, generateVariations } from "@/lib/ai-exercise";
import { requireApiUser } from "@/lib/session";

// Génère 2 exercices alternatifs (mêmes muscles) pour un exercice, en
// piochant de préférence dans le catalogue des exercices déjà connus, et les
// enregistre comme variantes jouées en rotation. Remplace les variantes
// existantes (l'historique des variantes reste retrouvé par nom).
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireApiUser();
  if (user instanceof NextResponse) return user;
  const { id } = await params;

  try {
    const { variations } = await generateVariations(id, user.id);
    const count = await applyVariations(id, variations);
    return NextResponse.json({ count });
  } catch (e) {
    if (e instanceof AiError) {
      return NextResponse.json({ error: e.userMessage }, { status: e.status });
    }
    console.error("exercise variations:", e);
    return NextResponse.json(
      { error: "La génération des variantes a échoué. Réessaie." },
      { status: 502 }
    );
  }
}
