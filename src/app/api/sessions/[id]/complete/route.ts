import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiUser } from "@/lib/session";

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
    select: { id: true },
  });
  if (!session) {
    return NextResponse.json({ error: "Séance introuvable" }, { status: 404 });
  }
  await prisma.workoutSession.update({
    where: { id },
    data: { completedAt: new Date() },
  });
  return NextResponse.json({ ok: true });
}
