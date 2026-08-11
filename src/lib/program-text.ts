// Sérialisation texte d'un programme complet : utilisée par l'export .txt et
// comme contexte injecté dans le prompt de l'assistant.

type VariationLike = {
  name: string;
  sets: number;
  reps: string;
  restSeconds: number;
  weightHint: string | null;
};

type ExerciseLike = {
  name: string;
  sets: number;
  reps: string;
  restSeconds: number;
  weightHint: string | null;
  equipment: string[];
  muscles: string[];
  targetSeconds: number | null;
  setSeconds: number | null;
  notes: string | null;
  howTo: string | null;
  variations: VariationLike[];
};

export type ProgramForText = {
  name: string;
  description: string | null;
  goal: string | null;
  level: string | null;
  blockCycles: number | null;
  blockNumber: number;
  location: { name: string } | null;
  days: {
    name: string;
    focus: string | null;
    exercises: ExerciseLike[];
  }[];
};

function line(seconds: number | null | undefined, suffix: string): string {
  return seconds != null ? ` · ${suffix} ${seconds}s` : "";
}

export function renderProgramText(program: ProgramForText): string {
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
  return parts.join("\n");
}
