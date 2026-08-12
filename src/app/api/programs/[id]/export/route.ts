import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { renderProgramText } from "@/lib/program-text";
import { requireApiUser } from "@/lib/session";

// Exporte un programme complet en fichier texte lisible : jours, exercices,
// variantes, muscles, conseils et descriptions d'exécution déjà générées.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireApiUser();
  if (user instanceof NextResponse) return user;
  const { id } = await params;
  const program = await prisma.program.findFirst({
    where: { id, userId: user.id },
    include: {
      location: true,
      days: {
        orderBy: { dayIndex: "asc" },
        include: {
          exercises: {
            orderBy: { order: "asc" },
            include: { variations: { orderBy: { order: "asc" } } },
          },
        },
      },
    },
  });
  if (!program) {
    return NextResponse.json({ error: "Programme introuvable" }, { status: 404 });
  }

  const text = `${renderProgramText(program)}\nExporté depuis Mon Coach Fitness le ${new Intl.DateTimeFormat("fr-FR", { dateStyle: "long" }).format(new Date())}.`;

  const fileName = `${program.name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase() || "programme"}.txt`;

  return new NextResponse(text, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": `attachment; filename="${fileName}"`,
    },
  });
}
