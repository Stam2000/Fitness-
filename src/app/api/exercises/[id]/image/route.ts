import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSettings } from "@/lib/settings";
import {
  buildExerciseImagePrompt,
  createImageTask,
  getImageTaskResult,
} from "@/lib/kie";

// Lance la génération d'image pour un exercice.
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

  const exercise = await prisma.exercise.findUnique({ where: { id } });
  if (!exercise) {
    return NextResponse.json({ error: "Exercice introuvable" }, { status: 404 });
  }

  try {
    const prompt = buildExerciseImagePrompt(exercise.name, exercise.equipment);
    const taskId = await createImageTask(prompt, settings.kieApiKey);
    await prisma.exercise.update({
      where: { id },
      data: { imageTaskId: taskId },
    });
    return NextResponse.json({ taskId });
  } catch (e) {
    console.error("exercise image POST:", e);
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
  const exercise = await prisma.exercise.findUnique({ where: { id } });
  if (!exercise) {
    return NextResponse.json({ error: "Exercice introuvable" }, { status: 404 });
  }
  if (!exercise.imageTaskId) {
    return NextResponse.json({ state: "none", imageUrl: exercise.imageUrl });
  }

  const settings = await getSettings();
  if (!settings.kieApiKey) {
    return NextResponse.json({ error: "Clé Kie.ai manquante" }, { status: 400 });
  }

  try {
    const result = await getImageTaskResult(
      exercise.imageTaskId,
      settings.kieApiKey
    );
    if (result.state === "success" && result.url) {
      await prisma.exercise.update({
        where: { id },
        data: { imageUrl: result.url, imageTaskId: null },
      });
      return NextResponse.json({ state: "success", imageUrl: result.url });
    }
    if (result.state === "fail") {
      await prisma.exercise.update({
        where: { id },
        data: { imageTaskId: null },
      });
      return NextResponse.json({ state: "fail", error: result.error });
    }
    return NextResponse.json({ state: result.state });
  } catch (e) {
    console.error("exercise image GET:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Erreur Kie.ai" },
      { status: 502 }
    );
  }
}
