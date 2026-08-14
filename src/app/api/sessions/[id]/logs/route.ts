import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireApiUser } from "@/lib/session";
import { loggedExerciseName } from "@/lib/program-versions";

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

  // L'exercice arrive du corps de la requête : il doit faire partie du plan de
  // cette séance, sinon on écrirait une série sur l'exercice de quelqu'un
  // d'autre. La résolution du nom sert aussi de contrôle de propriété.
  const exerciseName = await loggedExerciseName(prisma, id, user.id, exerciseId);
  if (!exerciseName) {
    return NextResponse.json({ error: "Séance introuvable" }, { status: 404 });
  }

  await prisma.setLog.upsert({
    where: {
      sessionId_exerciseId_setIndex: { sessionId: id, exerciseId, setIndex },
    },
    // `exerciseName` n'est pas réécrit : une correction saisie des mois plus
    // tard ne doit pas rebaptiser la série avec le nom d'aujourd'hui.
    update: { reps, weightKg, done, variationName: variationName ?? null },
    create: {
      sessionId: id,
      exerciseId,
      exerciseName,
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
