import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

function line(seconds: number | null | undefined, suffix: string): string {
  return seconds != null ? ` · ${suffix} ${seconds}s` : "";
}

// Exporte un programme complet en fichier texte lisible : jours, exercices,
// variantes, muscles, conseils et descriptions d'exécution déjà générées.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const program = await prisma.program.findUnique({
    where: { id },
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

  const parts: string[] = [];
  parts.push(program.name.toUpperCase());
  parts.push("=".repeat(Math.min(program.name.length, 60)));
  if (program.description) parts.push(program.description);
  const meta = [
    program.goal ? `Objectif : ${program.goal}` : null,
    program.level ? `Niveau : ${program.level}` : null,
    program.location ? `Contexte : ${program.location.name}` : null,
    program.blockCycles
      ? `Bloc n°${program.blockNumber} · ${program.blockCycles} cycles`
      : null,
  ].filter(Boolean);
  if (meta.length > 0) parts.push(meta.join(" | "));
  parts.push("");

  for (const day of program.days) {
    parts.push(`${day.name}${day.focus ? ` — ${day.focus}` : ""}`);
    parts.push("-".repeat(40));
    day.exercises.forEach((ex, i) => {
      parts.push(
        `${i + 1}. ${ex.name} — ${ex.sets} × ${ex.reps} · repos ${ex.restSeconds}s${line(ex.setSeconds, "série")}${line(ex.targetSeconds, "total")}`
      );
      if (ex.weightHint) parts.push(`   Charge : ${ex.weightHint}`);
      if (ex.equipment.length > 0) {
        parts.push(`   Matériel : ${ex.equipment.join(", ")}`);
      }
      if (ex.muscles.length > 0) {
        parts.push(`   Muscles : ${ex.muscles.join(", ")}`);
      }
      if (ex.notes) parts.push(`   Note : ${ex.notes}`);
      for (const v of ex.variations) {
        parts.push(
          `   ↔ Variante : ${v.name} — ${v.sets} × ${v.reps} · repos ${v.restSeconds}s${v.weightHint ? ` · ${v.weightHint}` : ""}`
        );
      }
      if (ex.howTo) {
        parts.push("   Exécution :");
        parts.push(
          ex.howTo
            .split("\n")
            .map((l) => `     ${l}`)
            .join("\n")
        );
      }
      parts.push("");
    });
  }
  parts.push(
    `Exporté depuis Mon Coach Fitness le ${new Intl.DateTimeFormat("fr-FR", { dateStyle: "long" }).format(new Date())}.`
  );

  const fileName = `${program.name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase() || "programme"}.txt`;

  return new NextResponse(parts.join("\n"), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": `attachment; filename="${fileName}"`,
    },
  });
}
