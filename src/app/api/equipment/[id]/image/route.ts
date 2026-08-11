import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSettings } from "@/lib/settings";
import {
  buildEquipmentImagePrompt,
  createImageTask,
  getImageTaskResult,
} from "@/lib/kie";
import { persistMediaUrl } from "@/lib/media-store";

// Lance la génération d'image pour un équipement.
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

  const equipment = await prisma.equipment.findUnique({ where: { id } });
  if (!equipment) {
    return NextResponse.json(
      { error: "Équipement introuvable" },
      { status: 404 }
    );
  }

  try {
    const prompt = buildEquipmentImagePrompt(equipment.name, equipment.category);
    const taskId = await createImageTask(prompt, settings.kieApiKey, "1:1");
    await prisma.equipment.update({
      where: { id },
      data: { imageTaskId: taskId },
    });
    return NextResponse.json({ taskId });
  } catch (e) {
    console.error("equipment image POST:", e);
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
  const equipment = await prisma.equipment.findUnique({ where: { id } });
  if (!equipment) {
    return NextResponse.json(
      { error: "Équipement introuvable" },
      { status: 404 }
    );
  }
  if (!equipment.imageTaskId) {
    return NextResponse.json({ state: "none", imageUrl: equipment.imageUrl });
  }

  const settings = await getSettings();
  if (!settings.kieApiKey) {
    return NextResponse.json({ error: "Clé Kie.ai manquante" }, { status: 400 });
  }

  try {
    const result = await getImageTaskResult(
      equipment.imageTaskId,
      settings.kieApiKey
    );
    if (result.state === "success" && result.url) {
      const imageUrl = await persistMediaUrl(result.url);
      await prisma.equipment.update({
        where: { id },
        data: { imageUrl, imageTaskId: null },
      });
      return NextResponse.json({ state: "success", imageUrl });
    }
    if (result.state === "fail") {
      await prisma.equipment.update({
        where: { id },
        data: { imageTaskId: null },
      });
      return NextResponse.json({ state: "fail", error: result.error });
    }
    return NextResponse.json({ state: result.state });
  } catch (e) {
    console.error("equipment image GET:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Erreur Kie.ai" },
      { status: 502 }
    );
  }
}
