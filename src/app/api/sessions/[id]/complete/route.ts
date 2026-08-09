import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await prisma.workoutSession.findUnique({ where: { id } });
  if (!session) {
    return NextResponse.json({ error: "Séance introuvable" }, { status: 404 });
  }
  await prisma.workoutSession.update({
    where: { id },
    data: { completedAt: new Date() },
  });
  return NextResponse.json({ ok: true });
}
