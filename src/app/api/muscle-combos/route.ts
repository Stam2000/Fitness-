import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSettings } from "@/lib/settings";
import { muscleComboKey } from "@/lib/normalize";
import { getKnownMuscles, resolveMuscleNames } from "@/lib/known-muscles";
import { buildMuscleComboImagePrompt, createImageTask } from "@/lib/kie";

const requestSchema = z.object({
  muscles: z.array(z.string().min(1)).min(2).max(6),
});

// Retrouve — ou crée — la combinaison de muscles demandée et lance la
// génération de son illustration si elle manque. Utilisé par le popup de
// prévisualisation pour les combinaisons pas encore en base (anciens
// programmes). Renvoie { id, state, imageUrl? } ; le suivi se fait ensuite
// via GET /api/muscle-combos/[id]/image.
export async function POST(req: NextRequest) {
  const body = requestSchema.safeParse(await req.json().catch(() => ({})));
  if (!body.success) {
    return NextResponse.json({ error: "Requête invalide" }, { status: 400 });
  }

  // Noms recollés sur le catalogue pour un affichage et un prompt canoniques.
  const muscles = resolveMuscleNames(body.data.muscles, await getKnownMuscles());
  if (muscles.length < 2) {
    return NextResponse.json(
      { error: "Une combinaison demande au moins 2 muscles distincts." },
      { status: 400 }
    );
  }
  const key = muscleComboKey(muscles);

  let combo = await prisma.muscleCombo.findUnique({ where: { key } });
  if (!combo) {
    try {
      combo = await prisma.muscleCombo.create({ data: { key, muscles } });
    } catch (e) {
      // P2002 : créée entre-temps par une requête concurrente.
      if ((e as { code?: string })?.code !== "P2002") throw e;
      combo = await prisma.muscleCombo.findUniqueOrThrow({ where: { key } });
    }
  }

  if (combo.imageUrl) {
    return NextResponse.json({
      id: combo.id,
      state: "success",
      imageUrl: combo.imageUrl,
    });
  }
  if (combo.imageTaskId) {
    return NextResponse.json({ id: combo.id, state: "generating" });
  }

  const settings = await getSettings();
  if (!settings.kieApiKey) {
    return NextResponse.json(
      {
        error:
          "Aucune clé Kie.ai configurée. Ajoute ta clé dans Réglages pour générer des images.",
      },
      { status: 400 }
    );
  }

  try {
    const taskId = await createImageTask(
      buildMuscleComboImagePrompt(combo.muscles),
      settings.kieApiKey,
      "1:1"
    );
    await prisma.muscleCombo.update({
      where: { id: combo.id },
      data: { imageTaskId: taskId },
    });
    return NextResponse.json({ id: combo.id, state: "generating" });
  } catch (e) {
    console.error("muscle-combos POST:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Erreur Kie.ai" },
      { status: 502 }
    );
  }
}
