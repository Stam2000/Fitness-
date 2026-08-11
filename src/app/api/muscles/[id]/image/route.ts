import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSettings } from "@/lib/settings";
import {
  buildMuscleImagePrompt,
  createImageTask,
  getImageTaskResult,
} from "@/lib/kie";

// Lance la génération d'image pour un groupe musculaire.
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
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

  const muscle = await prisma.muscle.findUnique({ where: { id } });
  if (!muscle) {
    return NextResponse.json({ error: "Muscle introuvable" }, { status: 404 });
  }

  try {
    const prompt = buildMuscleImagePrompt(muscle.name);
    const taskId = await createImageTask(prompt, settings.kieApiKey, "1:1");
    await prisma.muscle.update({
      where: { id },
      data: { imageTaskId: taskId },
    });
    return NextResponse.json({ taskId });
  } catch (e) {
    console.error("muscle image POST:", e);
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
  const muscle = await prisma.muscle.findUnique({ where: { id } });
  if (!muscle) {
    return NextResponse.json({ error: "Muscle introuvable" }, { status: 404 });
  }
  if (!muscle.imageTaskId) {
    return NextResponse.json({ state: "none", imageUrl: muscle.imageUrl });
  }

  const settings = await getSettings();
  if (!settings.kieApiKey) {
    return NextResponse.json({ error: "Clé Kie.ai manquante" }, { status: 400 });
  }

  try {
    const result = await getImageTaskResult(
      muscle.imageTaskId,
      settings.kieApiKey
    );
    if (result.state === "success" && result.url) {
      await prisma.muscle.update({
        where: { id },
        data: { imageUrl: result.url, imageTaskId: null },
      });
      return NextResponse.json({ state: "success", imageUrl: result.url });
    }
    if (result.state === "fail") {
      await prisma.muscle.update({
        where: { id },
        data: { imageTaskId: null },
      });
      return NextResponse.json({ state: "fail", error: result.error });
    }
    return NextResponse.json({ state: result.state });
  } catch (e) {
    console.error("muscle image GET:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Erreur Kie.ai" },
      { status: 502 }
    );
  }
}
