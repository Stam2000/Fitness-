import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { AiError } from "@/lib/openrouter";
import {
  generateProgramEditDraft,
  type EditedProgramDraft,
} from "@/lib/ai-program-edit";
import { generateSubstitute, generateVariations } from "@/lib/ai-exercise";
import type { ChatProposal } from "@/lib/chat-shared";

export type { ChatProposal, ChatToolTrace } from "@/lib/chat-shared";
export { TOOL_LABELS } from "@/lib/chat-shared";

// Définitions au format tool-calling OpenAI/OpenRouter.
export const CHAT_TOOLS = [
  {
    type: "function",
    function: {
      name: "list_programs",
      description:
        "Liste tous les programmes de l'utilisateur (actifs et archivés) avec leur id, objectif, niveau et nombre de jours.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "get_program",
      description:
        "Renvoie le détail complet d'un programme : jours, exercices et variantes AVEC leurs ids (nécessaires pour proposer une modification), plus l'équipement disponible.",
      parameters: {
        type: "object",
        properties: {
          programId: { type: "string", description: "Id du programme" },
        },
        required: ["programId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_progress",
      description:
        "Renvoie les dernières séances terminées (séries, charges, répétitions) et, si exerciseName est fourni, l'historique de progression de ce mouvement.",
      parameters: {
        type: "object",
        properties: {
          programId: {
            type: "string",
            description: "Limiter aux séances de ce programme (optionnel)",
          },
          exerciseName: {
            type: "string",
            description:
              "Nom (même partiel) d'un mouvement dont détailler la progression (optionnel)",
          },
          limit: {
            type: "number",
            description: "Nombre de séances récentes à renvoyer (défaut 8)",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "propose_program_edit",
      description:
        "Prépare une modification du programme (ajouter/retirer/changer des jours ou exercices) à partir d'instructions en langage naturel. La modification est PROPOSÉE à l'utilisateur qui doit la confirmer — elle n'est pas appliquée par cet outil. Appelle d'abord get_program pour connaître le contenu exact.",
      parameters: {
        type: "object",
        properties: {
          programId: { type: "string", description: "Id du programme" },
          instructions: {
            type: "string",
            description:
              "Instructions précises et autonomes décrivant la modification (en français)",
          },
        },
        required: ["programId", "instructions"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "propose_substitution",
      description:
        "Prépare le remplacement définitif d'UN exercice par une alternative équivalente (mêmes muscles). La proposition doit être confirmée par l'utilisateur. Utilise l'exerciseId renvoyé par get_program.",
      parameters: {
        type: "object",
        properties: {
          exerciseId: { type: "string", description: "Id de l'exercice" },
          reason: {
            type: "string",
            description:
              "Raison du remplacement (douleur, matériel indisponible…), optionnelle",
          },
        },
        required: ["exerciseId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "propose_variations",
      description:
        "Prépare 2 exercices alternatifs (mêmes muscles) joués en rotation à la place d'un exercice, sans le remplacer. Remplace les variantes existantes. La proposition doit être confirmée par l'utilisateur. Utilise l'exerciseId renvoyé par get_program.",
      parameters: {
        type: "object",
        properties: {
          exerciseId: { type: "string", description: "Id de l'exercice" },
        },
        required: ["exerciseId"],
      },
    },
  },
];

const getProgramArgs = z.object({ programId: z.string().min(1) });
const getProgressArgs = z.object({
  programId: z.string().min(1).optional(),
  exerciseName: z.string().min(1).optional(),
  limit: z.number().int().min(1).max(30).optional(),
});
const proposeEditArgs = z.object({
  programId: z.string().min(1),
  instructions: z.string().min(3).max(2000),
});
const proposeSubstitutionArgs = z.object({
  exerciseId: z.string().min(1),
  reason: z.string().max(300).optional(),
});
const proposeVariationsArgs = z.object({ exerciseId: z.string().min(1) });

async function listPrograms(): Promise<{ result: string; summary: string }> {
  const programs = await prisma.program.findMany({
    orderBy: { createdAt: "desc" },
    include: { location: true, _count: { select: { days: true } } },
  });
  const rows = programs.map((p) => ({
    id: p.id,
    name: p.name,
    goal: p.goal,
    level: p.level,
    blockNumber: p.blockNumber,
    blockCycles: p.blockCycles,
    dayCount: p._count.days,
    locationName: p.location?.name ?? null,
    archived: p.archivedAt != null,
    createdAt: p.createdAt.toISOString().slice(0, 10),
  }));
  return {
    result: JSON.stringify(rows),
    summary: `${rows.length} programme${rows.length > 1 ? "s" : ""}`,
  };
}

async function getProgram(args: {
  programId: string;
}): Promise<{ result: string; summary: string }> {
  const program = await prisma.program.findUnique({
    where: { id: args.programId },
    include: {
      location: { include: { equipment: { include: { equipment: true } } } },
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
    return {
      result: "Erreur : programme introuvable avec cet id.",
      summary: "Programme introuvable",
    };
  }
  const detail = {
    id: program.id,
    name: program.name,
    description: program.description,
    goal: program.goal,
    level: program.level,
    blockNumber: program.blockNumber,
    blockCycles: program.blockCycles,
    archived: program.archivedAt != null,
    equipmentAvailable:
      program.location?.equipment.map((e) => e.equipment.name) ?? [],
    days: program.days.map((d) => ({
      id: d.id,
      name: d.name,
      focus: d.focus,
      exercises: d.exercises.map((ex) => ({
        id: ex.id,
        name: ex.name,
        sets: ex.sets,
        reps: ex.reps,
        restSeconds: ex.restSeconds,
        weightHint: ex.weightHint,
        equipment: ex.equipment,
        muscles: ex.muscles,
        notes: ex.notes,
        variations: ex.variations.map((v) => ({
          name: v.name,
          sets: v.sets,
          reps: v.reps,
        })),
      })),
    })),
  };
  return {
    result: JSON.stringify(detail),
    summary: `Programme « ${program.name} » lu`,
  };
}

async function getProgress(args: {
  programId?: string;
  exerciseName?: string;
  limit?: number;
}): Promise<{ result: string; summary: string }> {
  const limit = args.limit ?? 8;
  const sessions = await prisma.workoutSession.findMany({
    where: {
      completedAt: { not: null },
      ...(args.programId ? { day: { programId: args.programId } } : {}),
    },
    orderBy: { completedAt: "desc" },
    take: limit,
    include: {
      day: { include: { program: { select: { name: true } } } },
      setLogs: { where: { done: true }, include: { exercise: true } },
    },
  });

  const sessionRows = sessions.map((s) => {
    // Regroupe les séries par nom effectif (variante exécutée ou exercice).
    const byName = new Map<
      string,
      { sets: number; topWeightKg: number | null; topReps: number | null }
    >();
    for (const log of s.setLogs) {
      const name = log.variationName ?? log.exercise.name;
      const entry = byName.get(name) ?? {
        sets: 0,
        topWeightKg: null,
        topReps: null,
      };
      entry.sets++;
      if (log.weightKg != null) {
        entry.topWeightKg = Math.max(entry.topWeightKg ?? 0, log.weightKg);
      }
      if (log.reps != null) {
        entry.topReps = Math.max(entry.topReps ?? 0, log.reps);
      }
      byName.set(name, entry);
    }
    return {
      date: s.completedAt!.toISOString().slice(0, 10),
      program: s.day.program.name,
      day: s.day.name,
      exercises: Object.fromEntries(byName),
      feedback: s.aiFeedback,
    };
  });

  let exerciseHistory: unknown = undefined;
  if (args.exerciseName) {
    const needle = args.exerciseName.trim().toLowerCase();
    const logs = await prisma.setLog.findMany({
      where: { done: true, session: { completedAt: { not: null } } },
      include: {
        exercise: { select: { name: true } },
        session: { select: { completedAt: true } },
      },
      orderBy: { session: { completedAt: "asc" } },
    });
    const points = new Map<
      string,
      { topWeightKg: number | null; topReps: number | null }
    >();
    for (const log of logs) {
      const name = log.variationName ?? log.exercise.name;
      if (!name.toLowerCase().includes(needle)) continue;
      const date = log.session.completedAt!.toISOString().slice(0, 10);
      const key = `${date} — ${name}`;
      const entry = points.get(key) ?? { topWeightKg: null, topReps: null };
      if (log.weightKg != null) {
        entry.topWeightKg = Math.max(entry.topWeightKg ?? 0, log.weightKg);
      }
      if (log.reps != null) {
        entry.topReps = Math.max(entry.topReps ?? 0, log.reps);
      }
      points.set(key, entry);
    }
    exerciseHistory = Object.fromEntries(points);
  }

  return {
    result: JSON.stringify({ sessions: sessionRows, exerciseHistory }),
    summary: `${sessionRows.length} séance${sessionRows.length > 1 ? "s" : ""} analysée${sessionRows.length > 1 ? "s" : ""}`,
  };
}

// Résumé lisible des changements entre le programme actuel et le brouillon.
async function computeProgramEditChanges(
  programId: string,
  draft: EditedProgramDraft
): Promise<string[]> {
  const program = await prisma.program.findUnique({
    where: { id: programId },
    include: {
      days: {
        orderBy: { dayIndex: "asc" },
        include: { exercises: { orderBy: { order: "asc" } } },
      },
    },
  });
  if (!program) return [];

  const changes: string[] = [];
  const draftDayIds = new Set(
    draft.days.map((d) => d.id).filter(Boolean) as string[]
  );
  const draftExIds = new Set(
    draft.days
      .flatMap((d) => d.exercises.map((e) => e.id))
      .filter(Boolean) as string[]
  );
  const currentExById = new Map(
    program.days.flatMap((d) => d.exercises.map((e) => [e.id, e] as const))
  );

  if (draft.name !== program.name) {
    changes.push(`Nom : « ${program.name} » → « ${draft.name} »`);
  }
  for (const day of program.days) {
    if (!draftDayIds.has(day.id)) {
      changes.push(`Jour supprimé : ${day.name}`);
    }
  }
  for (const day of draft.days) {
    if (!day.id) {
      changes.push(
        `Nouveau jour : ${day.name} (${day.exercises.length} exercices)`
      );
      continue;
    }
    const current = program.days.find((d) => d.id === day.id);
    if (current && current.name !== day.name) {
      changes.push(`Jour renommé : « ${current.name} » → « ${day.name} »`);
    }
    for (const ex of day.exercises) {
      if (!ex.id) {
        changes.push(`${day.name} : nouvel exercice « ${ex.name} » — ${ex.sets} × ${ex.reps}`);
        continue;
      }
      const cur = currentExById.get(ex.id);
      if (!cur) continue;
      const diffs: string[] = [];
      if (cur.name !== ex.name) diffs.push(`« ${cur.name} » → « ${ex.name} »`);
      if (cur.sets !== ex.sets || cur.reps !== ex.reps) {
        diffs.push(`${cur.sets} × ${cur.reps} → ${ex.sets} × ${ex.reps}`);
      }
      if (cur.restSeconds !== ex.restSeconds) {
        diffs.push(`repos ${cur.restSeconds}s → ${ex.restSeconds}s`);
      }
      if ((cur.weightHint ?? null) !== (ex.weightHint ?? null)) {
        diffs.push(`charge : ${ex.weightHint ?? "—"}`);
      }
      if ((cur.notes ?? null) !== (ex.notes ?? null)) diffs.push("note modifiée");
      if (diffs.length > 0) {
        changes.push(`${day.name} : ${cur.name} — ${diffs.join(", ")}`);
      }
    }
    if (current) {
      for (const cur of current.exercises) {
        if (!draftExIds.has(cur.id)) {
          changes.push(`${current.name} : exercice supprimé « ${cur.name} »`);
        }
      }
    }
  }
  return changes;
}

export type ChatToolOutcome = {
  result: string;
  summary: string;
  proposal?: ChatProposal;
};

const PROPOSAL_PENDING_NOTE =
  "Proposition affichée à l'utilisateur (en attente de confirmation Appliquer/Annuler). Ne considère PAS la modification comme faite et n'appelle pas d'autre outil de proposition dans ce tour.";

// Exécute un outil du chat. `hasPendingProposal` = une proposition a déjà été
// produite dans ce tour (une seule carte de confirmation par message).
export async function executeChatTool(
  name: string,
  rawArgs: unknown,
  hasPendingProposal: boolean
): Promise<ChatToolOutcome> {
  try {
    switch (name) {
      case "list_programs":
        return await listPrograms();
      case "get_program": {
        const args = getProgramArgs.parse(rawArgs);
        return await getProgram(args);
      }
      case "get_progress": {
        const args = getProgressArgs.parse(rawArgs);
        return await getProgress(args);
      }
      case "propose_program_edit": {
        if (hasPendingProposal) return pendingProposalError();
        const args = proposeEditArgs.parse(rawArgs);
        const program = await prisma.program.findUnique({
          where: { id: args.programId },
          select: { name: true },
        });
        if (!program) {
          return {
            result: "Erreur : programme introuvable avec cet id.",
            summary: "Programme introuvable",
          };
        }
        const draft = await generateProgramEditDraft(
          args.programId,
          args.instructions
        );
        const changes = await computeProgramEditChanges(args.programId, draft);
        return {
          result: PROPOSAL_PENDING_NOTE,
          summary: `Modification proposée (${changes.length} changement${changes.length > 1 ? "s" : ""})`,
          proposal: {
            kind: "program_edit",
            programId: args.programId,
            programName: program.name,
            draft,
            changes,
          },
        };
      }
      case "propose_substitution": {
        if (hasPendingProposal) return pendingProposalError();
        const args = proposeSubstitutionArgs.parse(rawArgs);
        const exercise = await prisma.exercise.findUnique({
          where: { id: args.exerciseId },
          select: { day: { select: { programId: true } } },
        });
        if (!exercise) {
          return {
            result: "Erreur : exercice introuvable avec cet id.",
            summary: "Exercice introuvable",
          };
        }
        const { oldName, dayName, replacement } = await generateSubstitute(
          args.exerciseId,
          args.reason
        );
        return {
          result: `${PROPOSAL_PENDING_NOTE}\nRemplacement proposé : ${oldName} → ${replacement.name} (${replacement.sets} × ${replacement.reps}).`,
          summary: `${oldName} → ${replacement.name}`,
          proposal: {
            kind: "substitution",
            exerciseId: args.exerciseId,
            programId: exercise.day.programId,
            dayName,
            oldName,
            replacement,
          },
        };
      }
      case "propose_variations": {
        if (hasPendingProposal) return pendingProposalError();
        const args = proposeVariationsArgs.parse(rawArgs);
        const exercise = await prisma.exercise.findUnique({
          where: { id: args.exerciseId },
          select: { day: { select: { programId: true } } },
        });
        if (!exercise) {
          return {
            result: "Erreur : exercice introuvable avec cet id.",
            summary: "Exercice introuvable",
          };
        }
        const { exerciseName, variations } = await generateVariations(
          args.exerciseId
        );
        return {
          result: `${PROPOSAL_PENDING_NOTE}\nVariantes proposées : ${variations.map((v) => v.name).join(", ")}.`,
          summary: `${variations.length} variante${variations.length > 1 ? "s" : ""} pour ${exerciseName}`,
          proposal: {
            kind: "variations",
            exerciseId: args.exerciseId,
            programId: exercise.day.programId,
            exerciseName,
            variations,
          },
        };
      }
      default:
        return {
          result: `Erreur : outil inconnu « ${name} ».`,
          summary: "Outil inconnu",
        };
    }
  } catch (e) {
    if (e instanceof z.ZodError) {
      return {
        result: `Erreur de paramètres : ${e.issues.map((i) => `${i.path.join(".")} — ${i.message}`).join(" ; ")}`,
        summary: "Paramètres invalides",
      };
    }
    if (e instanceof AiError) {
      return { result: `Erreur : ${e.userMessage}`, summary: e.userMessage };
    }
    console.error(`chat tool ${name}:`, e);
    return {
      result: "Erreur inattendue pendant l'exécution de l'outil.",
      summary: "Erreur d'outil",
    };
  }
}

function pendingProposalError(): ChatToolOutcome {
  return {
    result:
      "Erreur : une proposition est déjà en attente dans ce tour. Termine ta réponse ; l'utilisateur doit d'abord confirmer ou annuler la proposition affichée.",
    summary: "Proposition déjà en attente",
  };
}
