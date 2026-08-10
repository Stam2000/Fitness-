import { prisma } from "@/lib/prisma";

// Réutilise une image déjà générée pour un mouvement du même nom (exercice de
// base ou variante d'un autre programme/jour), pour économiser les crédits
// Kie.ai : même nom → même illustration.
export async function findExistingImageByName(
  name: string,
  exclude?: { exerciseId?: string; variationId?: string }
): Promise<string | null> {
  const trimmed = name.trim();
  if (!trimmed) return null;

  const exercise = await prisma.exercise.findFirst({
    where: {
      name: { equals: trimmed, mode: "insensitive" },
      imageUrl: { not: null },
      ...(exclude?.exerciseId ? { id: { not: exclude.exerciseId } } : {}),
    },
    select: { imageUrl: true },
  });
  if (exercise?.imageUrl) return exercise.imageUrl;

  const variation = await prisma.exerciseVariation.findFirst({
    where: {
      name: { equals: trimmed, mode: "insensitive" },
      imageUrl: { not: null },
      ...(exclude?.variationId ? { id: { not: exclude.variationId } } : {}),
    },
    select: { imageUrl: true },
  });
  return variation?.imageUrl ?? null;
}

// Même logique pour les vidéos de démonstration : même nom → même vidéo (et
// même prompt), sans repayer une génération Seedance.
export async function findExistingVideoByName(
  name: string,
  exclude?: { exerciseId?: string; variationId?: string }
): Promise<{ videoUrl: string; videoPrompt: string | null } | null> {
  const trimmed = name.trim();
  if (!trimmed) return null;

  const exercise = await prisma.exercise.findFirst({
    where: {
      name: { equals: trimmed, mode: "insensitive" },
      videoUrl: { not: null },
      ...(exclude?.exerciseId ? { id: { not: exclude.exerciseId } } : {}),
    },
    select: { videoUrl: true, videoPrompt: true },
  });
  if (exercise?.videoUrl) {
    return { videoUrl: exercise.videoUrl, videoPrompt: exercise.videoPrompt };
  }

  const variation = await prisma.exerciseVariation.findFirst({
    where: {
      name: { equals: trimmed, mode: "insensitive" },
      videoUrl: { not: null },
      ...(exclude?.variationId ? { id: { not: exclude.variationId } } : {}),
    },
    select: { videoUrl: true, videoPrompt: true },
  });
  return variation?.videoUrl
    ? { videoUrl: variation.videoUrl, videoPrompt: variation.videoPrompt }
    : null;
}
