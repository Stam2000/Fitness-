import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

const logSchema = z.object({
  exerciseId: z.string(),
  setIndex: z.number().int().min(0),
  reps: z.number().int().min(0).nullable(),
  weightKg: z.number().min(0).nullable(),
  done: z.boolean(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = logSchema.safeParse(await req.json());
  if (!body.success) {
    return NextResponse.json({ error: "Payload invalide" }, { status: 400 });
  }
  const { exerciseId, setIndex, reps, weightKg, done } = body.data;

  const session = await prisma.workoutSession.findUnique({ where: { id } });
  if (!session) {
    return NextResponse.json({ error: "Séance introuvable" }, { status: 404 });
  }

  await prisma.setLog.upsert({
    where: {
      sessionId_exerciseId_setIndex: { sessionId: id, exerciseId, setIndex },
    },
    update: { reps, weightKg, done },
    create: { sessionId: id, exerciseId, setIndex, reps, weightKg, done },
  });

  return NextResponse.json({ ok: true });
}
