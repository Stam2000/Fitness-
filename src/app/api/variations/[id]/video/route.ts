import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSettings } from "@/lib/settings";
import { findExistingVideoByName } from "@/lib/exercise-images";
import { generateExerciseVideoPrompt } from "@/lib/video-prompt";
import { createVideoTask, getVideoTaskResult } from "@/lib/kie";

// Lance la génération de la vidéo de démonstration d'une variante d'exercice.
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const variation = await prisma.exerciseVariation.findUnique({
    where: { id },
  });
  if (!variation) {
    return NextResponse.json({ error: "Variante introuvable" }, { status: 404 });
  }

  // Un mouvement du même nom a déjà une vidéo ? On la réutilise sans Kie.
  const existing = await findExistingVideoByName(variation.name, {
    variationId: id,
  });
  if (existing) {
    await prisma.exerciseVariation.update({
      where: { id },
      data: {
        videoUrl: existing.videoUrl,
        videoPrompt: existing.videoPrompt,
        videoTaskId: null,
      },
    });
    return NextResponse.json({ state: "success", videoUrl: existing.videoUrl });
  }

  const settings = await getSettings();
  if (!settings.kieApiKey) {
    return NextResponse.json(
      {
        error:
          "Aucune clé Kie.ai configurée. Ajoute ta clé dans Réglages pour générer des vidéos.",
      },
      { status: 400 }
    );
  }

  try {
    const prompt = await generateExerciseVideoPrompt(variation, settings);
    const taskId = await createVideoTask(prompt, settings.kieApiKey);
    await prisma.exerciseVariation.update({
      where: { id },
      data: { videoTaskId: taskId, videoPrompt: prompt },
    });
    return NextResponse.json({ taskId });
  } catch (e) {
    console.error("variation video POST:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Erreur Kie.ai" },
      { status: 502 }
    );
  }
}

// Interroge l'état de la génération ; enregistre l'URL quand elle est prête.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const variation = await prisma.exerciseVariation.findUnique({
    where: { id },
  });
  if (!variation) {
    return NextResponse.json({ error: "Variante introuvable" }, { status: 404 });
  }
  if (!variation.videoTaskId) {
    return NextResponse.json({ state: "none", videoUrl: variation.videoUrl });
  }

  const settings = await getSettings();
  if (!settings.kieApiKey) {
    return NextResponse.json({ error: "Clé Kie.ai manquante" }, { status: 400 });
  }

  try {
    const result = await getVideoTaskResult(
      variation.videoTaskId,
      settings.kieApiKey
    );
    if (result.state === "success" && result.url) {
      await prisma.exerciseVariation.update({
        where: { id },
        data: { videoUrl: result.url, videoTaskId: null },
      });
      return NextResponse.json({ state: "success", videoUrl: result.url });
    }
    if (result.state === "fail") {
      await prisma.exerciseVariation.update({
        where: { id },
        data: { videoTaskId: null },
      });
      return NextResponse.json({ state: "fail", error: result.error });
    }
    return NextResponse.json({ state: result.state });
  } catch (e) {
    console.error("variation video GET:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Erreur Kie.ai" },
      { status: 502 }
    );
  }
}
