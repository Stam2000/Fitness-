import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireApiUser } from "@/lib/session";
import { ownsExercise } from "@/lib/ownership";

const logSchema = z.object({
  exerciseId: z.string(),
  setIndex: z.number().int().min(0),
  reps: z.number().int().min(0).nullable(),
  weightKg: z.number().min(0).nullable(),
  done: z.boolean(),
  // Nom de la variante réellement exécutée (null/absent = exercice de base).
  variationName: z.string().nullable().optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireApiUser();
  if (user instanceof NextResponse) return user;
  const { id } = await params;
  const body = logSchema.safeParse(await req.json());
  if (!body.success) {
    return NextResponse.json({ error: "Payload invalide" }, { status: 400 });
  }
  const { exerciseId, setIndex, reps, weightKg, done, variationName } =
    body.data;

  // L'exercice arrive du corps de la requête : il doit appartenir au compte,
  // sinon on écrirait une série sur l'exercice de quelqu'un d'autre.
  const [session, exerciseOwned] = await Promise.all([
    prisma.workoutSession.findFirst({
      where: { id, userId: user.id },
      select: { id: true },
    }),
    ownsExercise(exerciseId, user.id),
  ]);
  if (!session || !exerciseOwned) {
    return NextResponse.json({ error: "Séance introuvable" }, { status: 404 });
  }

  await prisma.setLog.upsert({
    where: {
      sessionId_exerciseId_setIndex: { sessionId: id, exerciseId, setIndex },
    },
    update: { reps, weightKg, done, variationName: variationName ?? null },
    create: {
      sessionId: id,
      exerciseId,
      setIndex,
      reps,
      weightKg,
      done,
      variationName: variationName ?? null,
    },
  });

  return NextResponse.json({ ok: true });
}

const deleteSchema = z.object({
  exerciseId: z.string(),
  setIndex: z.number().int().min(0),
});

// Supprime une série saisie par erreur (correction après coup depuis le
// suivi). Sans effet si la série n'existe pas.
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireApiUser();
  if (user instanceof NextResponse) return user;
  const { id } = await params;
  const body = deleteSchema.safeParse(await req.json().catch(() => null));
  if (!body.success) {
    return NextResponse.json({ error: "Payload invalide" }, { status: 400 });
  }
  const { exerciseId, setIndex } = body.data;

  // deleteMany filtré par propriétaire : sans effet si la série appartient à
  // quelqu'un d'autre ou n'existe pas.
  await prisma.setLog.deleteMany({
    where: {
      sessionId: id,
      exerciseId,
      setIndex,
      session: { userId: user.id },
    },
  });

  return NextResponse.json({ ok: true });
}
