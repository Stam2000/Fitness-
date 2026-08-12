import { prisma } from "@/lib/prisma";

/**
 * Vérifications de propriété pour les entités qui ne portent pas elles-mêmes
 * de `userId` : jour, exercice, variante. Leur propriétaire se déduit du
 * programme parent — dénormaliser plus bas ferait autant de colonnes à tenir
 * à jour pour un gain nul (ces tables sont toujours atteintes par leur id).
 *
 * Convention : une ressource appartenant à quelqu'un d'autre est traitée comme
 * inexistante (404), jamais comme interdite (403) — un 403 confirmerait son
 * existence.
 */

export async function ownsProgram(programId: string, userId: string) {
  return (await prisma.program.count({ where: { id: programId, userId } })) > 0;
}

export async function ownsDay(dayId: string, userId: string) {
  return (
    (await prisma.programDay.count({
      where: { id: dayId, program: { userId } },
    })) > 0
  );
}

export async function ownsExercise(exerciseId: string, userId: string) {
  return (
    (await prisma.exercise.count({
      where: { id: exerciseId, day: { program: { userId } } },
    })) > 0
  );
}

export async function ownsVariation(variationId: string, userId: string) {
  return (
    (await prisma.exerciseVariation.count({
      where: { id: variationId, exercise: { day: { program: { userId } } } },
    })) > 0
  );
}

export async function ownsSession(sessionId: string, userId: string) {
  return (
    (await prisma.workoutSession.count({ where: { id: sessionId, userId } })) > 0
  );
}

/** Message unique des Server Actions : ne révèle rien sur l'existence de la ressource. */
export const NOT_FOUND = "Ressource introuvable.";

export async function assertOwnsProgram(programId: string, userId: string) {
  if (!(await ownsProgram(programId, userId))) throw new Error(NOT_FOUND);
}

export async function assertOwnsSession(sessionId: string, userId: string) {
  if (!(await ownsSession(sessionId, userId))) throw new Error(NOT_FOUND);
}

export async function assertOwnsVariation(variationId: string, userId: string) {
  if (!(await ownsVariation(variationId, userId))) throw new Error(NOT_FOUND);
}
