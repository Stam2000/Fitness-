import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireApiUser } from "@/lib/session";
import { buildSessionPlan, latestVersionId } from "@/lib/program-versions";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireApiUser();
  if (user instanceof NextResponse) return user;
  const { id } = await params;
  // La séance d'un autre compte est un 404, comme une séance inexistante.
  const session = await prisma.workoutSession.findFirst({
    where: { id, userId: user.id },
    select: { id: true, dayId: true, planSnapshot: true },
  });
  if (!session) {
    return NextResponse.json({ error: "Séance introuvable" }, { status: 404 });
  }

  // Le plan figé est réécrit à la clôture : c'est le dernier moment où le
  // programme correspond encore à ce qui vient d'être exécuté (une retouche
  // faite en cours de séance est ainsi prise en compte). Si le jour a disparu
  // entre-temps, on garde le snapshot du démarrage.
  const plan = session.dayId
    ? await buildSessionPlan(prisma, session.dayId)
    : null;

  await prisma.workoutSession.update({
    where: { id },
    data: {
      completedAt: new Date(),
      ...(plan
        ? {
            planSnapshot: plan as unknown as Prisma.InputJsonValue,
            programVersionId: plan.programId
              ? await latestVersionId(plan.programId)
              : null,
          }
        : {}),
    },
  });
  return NextResponse.json({ ok: true });
}
