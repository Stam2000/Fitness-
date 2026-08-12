import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireApiUser } from "@/lib/session";

// Le client est la source de vérité : il envoie la carte complète
// { [exerciseId]: secondes } et on la remplace telle quelle.
const payloadSchema = z.object({
  seconds: z.record(z.string(), z.number().int().min(0).max(36_000)),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireApiUser();
  if (user instanceof NextResponse) return user;
  const { id } = await params;
  const body = payloadSchema.safeParse(await req.json().catch(() => null));
  if (!body.success) {
    return NextResponse.json({ error: "Payload invalide" }, { status: 400 });
  }

  const session = await prisma.workoutSession.findFirst({
    where: { id, userId: user.id },
    select: { id: true },
  });
  if (!session) {
    return NextResponse.json({ error: "Séance introuvable" }, { status: 404 });
  }

  await prisma.workoutSession.update({
    where: { id },
    data: { exerciseSeconds: body.data.seconds },
  });
  return NextResponse.json({ ok: true });
}
