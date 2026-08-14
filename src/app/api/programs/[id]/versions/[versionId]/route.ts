import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiUser } from "@/lib/session";
import { diffSnapshots, parseProgramSnapshot } from "@/lib/program-versions";

// Détail d'une version : le plan figé et ce qui a changé par rapport à la
// version précédente. Chargé à la demande — les snapshots pèsent trop pour
// être tous envoyés avec la page.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; versionId: string }> }
) {
  const user = await requireApiUser();
  if (user instanceof NextResponse) return user;
  const { id, versionId } = await params;

  const version = await prisma.programVersion.findFirst({
    where: { id: versionId, programId: id, program: { userId: user.id } },
    select: {
      versionNumber: true,
      source: true,
      note: true,
      createdAt: true,
      snapshot: true,
    },
  });
  if (!version) {
    return NextResponse.json({ error: "Version introuvable" }, { status: 404 });
  }
  const snapshot = parseProgramSnapshot(version.snapshot);
  if (!snapshot) {
    return NextResponse.json({ error: "Version illisible" }, { status: 422 });
  }

  const previous = await prisma.programVersion.findFirst({
    where: { programId: id, versionNumber: { lt: version.versionNumber } },
    orderBy: { versionNumber: "desc" },
    select: { snapshot: true },
  });
  const before = previous ? parseProgramSnapshot(previous.snapshot) : null;

  return NextResponse.json({
    versionNumber: version.versionNumber,
    source: version.source,
    note: version.note,
    createdAt: version.createdAt.toISOString(),
    name: snapshot.name,
    days: snapshot.days,
    diff: before ? diffSnapshots(before, snapshot) : null,
  });
}
