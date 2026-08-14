"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { AiError } from "@/lib/openrouter";
import { updateProgram } from "@/app/actions";
import {
  editedProgramSchema,
  sanitizeDraftIds,
} from "@/lib/ai-program-edit";
import { applySubstitute, applyVariations } from "@/lib/ai-exercise";
import { exerciseSchema, variationSchema } from "@/lib/program-schema";
import { requireActionUser } from "@/lib/session";
import { ownsProgram, ownsSession } from "@/lib/ownership";
import { loggedExerciseName } from "@/lib/program-versions";
import type { ChatProposal } from "@/lib/chat-tools";

export type ApplyResult = { ok: true } | { ok: false; error: string };

const STALE_MESSAGE =
  "La proposition n'est plus à jour — le programme a changé entre-temps. Redemande la modification.";

// Applique une proposition en attente. Re-valide systématiquement contre
// l'état ACTUEL de la base : une proposition devenue incohérente passe en
// statut « stale » plutôt que de corrompre le programme (updateProgram
// supprime tout ce qui est absent du payload).
export async function applyChatProposal(messageId: string): Promise<ApplyResult> {
  const user = await requireActionUser();
  // Le message n'est atteignable qu'à travers une conversation possédée.
  const message = await prisma.chatMessage.findFirst({
    where: { id: messageId, conversation: { userId: user.id } },
  });
  if (!message || !message.proposal) {
    return { ok: false, error: "Proposition introuvable." };
  }
  if (message.proposalStatus !== "pending") {
    return { ok: false, error: "Cette proposition a déjà été traitée." };
  }
  const proposal = message.proposal as ChatProposal;

  // Deuxième barrière : la proposition est du JSON relu depuis la base, ses
  // identifiants sont revérifiés contre le compte avant toute écriture.
  const target =
    proposal.kind === "set_logs"
      ? await ownsSession(proposal.sessionId, user.id)
      : await ownsProgram(proposal.programId, user.id);
  if (!target) return { ok: false, error: "Proposition introuvable." };

  try {
    switch (proposal.kind) {
      case "program_edit": {
        // Les données sortent de la base (JSON) : re-validation structurelle
        // puis re-contrôle des ids contre le programme courant.
        const draft = editedProgramSchema.parse(proposal.draft);
        const stripped = await sanitizeDraftIds(
          proposal.programId,
          user.id,
          draft
        );
        if (stripped > 0) {
          await setStatus(messageId, "stale");
          return { ok: false, error: STALE_MESSAGE };
        }
        await updateProgram(proposal.programId, {
          name: draft.name,
          description: draft.description ?? null,
          days: draft.days.map((d) => ({
            id: d.id ?? null,
            name: d.name,
            focus: d.focus ?? null,
            exercises: d.exercises.map((ex) => ({
              id: ex.id ?? null,
              name: ex.name,
              sets: ex.sets,
              reps: ex.reps,
              restSeconds: ex.restSeconds,
              weightHint: ex.weightHint ?? null,
              equipment: ex.equipment ?? [],
              muscles: ex.muscles ?? [],
              targetSeconds: ex.targetSeconds ?? null,
              setSeconds: ex.setSeconds ?? null,
              transitionSeconds: ex.transitionSeconds ?? null,
              notes: ex.notes ?? null,
            })),
          })),
        }, "ai");
        break;
      }
      case "substitution": {
        const replacement = exerciseSchema.parse(proposal.replacement);
        const exercise = await prisma.exercise.findFirst({
          where: { id: proposal.exerciseId, day: { program: { userId: user.id } } },
          select: { id: true },
        });
        if (!exercise) {
          await setStatus(messageId, "stale");
          return { ok: false, error: STALE_MESSAGE };
        }
        await applySubstitute(proposal.exerciseId, replacement);
        revalidatePath(`/programs/${proposal.programId}`);
        revalidatePath("/");
        break;
      }
      case "variations": {
        const variations = z
          .array(variationSchema)
          .min(1)
          .max(2)
          .parse(proposal.variations);
        const exercise = await prisma.exercise.findFirst({
          where: { id: proposal.exerciseId, day: { program: { userId: user.id } } },
          select: { id: true },
        });
        if (!exercise) {
          await setStatus(messageId, "stale");
          return { ok: false, error: STALE_MESSAGE };
        }
        await applyVariations(proposal.exerciseId, variations);
        revalidatePath(`/programs/${proposal.programId}`);
        revalidatePath("/");
        break;
      }
      case "set_logs": {
        const sets = z
          .array(
            z.object({
              setIndex: z.number().int().min(0).max(49),
              reps: z.number().int().min(0).max(1000).nullable(),
              weightKg: z.number().min(0).max(2000).nullable(),
              done: z.boolean(),
              variationName: z.string().nullable(),
            })
          )
          .min(1)
          .parse(proposal.sets);
        // Résout le nom à figer et vérifie du même coup que l'exercice fait
        // bien partie du plan de cette séance.
        const exerciseName = await loggedExerciseName(
          prisma,
          proposal.sessionId,
          user.id,
          proposal.exerciseId
        );
        if (!exerciseName) {
          await setStatus(messageId, "stale");
          return { ok: false, error: STALE_MESSAGE };
        }
        for (const set of sets) {
          await prisma.setLog.upsert({
            where: {
              sessionId_exerciseId_setIndex: {
                sessionId: proposal.sessionId,
                exerciseId: proposal.exerciseId,
                setIndex: set.setIndex,
              },
            },
            update: {
              reps: set.reps,
              weightKg: set.weightKg,
              done: set.done,
              variationName: set.variationName,
            },
            create: {
              sessionId: proposal.sessionId,
              exerciseId: proposal.exerciseId,
              exerciseName,
              setIndex: set.setIndex,
              reps: set.reps,
              weightKg: set.weightKg,
              done: set.done,
              variationName: set.variationName,
            },
          });
        }
        revalidatePath("/history");
        revalidatePath("/");
        break;
      }
      default:
        return { ok: false, error: "Type de proposition inconnu." };
    }
  } catch (e) {
    if (e instanceof AiError) {
      if (e.status === 404) {
        await setStatus(messageId, "stale");
        return { ok: false, error: STALE_MESSAGE };
      }
      return { ok: false, error: e.userMessage };
    }
    console.error("applyChatProposal:", e);
    return {
      ok: false,
      error: "L'application de la proposition a échoué. Réessaie.",
    };
  }

  await setStatus(messageId, "applied");
  return { ok: true };
}

export async function rejectChatProposal(messageId: string): Promise<void> {
  const user = await requireActionUser();
  const message = await prisma.chatMessage.findFirst({
    where: { id: messageId, conversation: { userId: user.id } },
    select: { proposalStatus: true },
  });
  if (message?.proposalStatus === "pending") {
    await setStatus(messageId, "rejected");
  }
}

async function setStatus(messageId: string, status: string) {
  await prisma.chatMessage.update({
    where: { id: messageId },
    data: { proposalStatus: status },
  });
}

export type ChatConversationSummary = {
  id: string;
  title: string | null;
  programId: string | null;
  updatedAt: string;
};

export async function listConversations(): Promise<ChatConversationSummary[]> {
  const user = await requireActionUser();
  const conversations = await prisma.chatConversation.findMany({
    where: { userId: user.id },
    orderBy: { updatedAt: "desc" },
    take: 20,
  });
  return conversations.map((c) => ({
    id: c.id,
    title: c.title,
    programId: c.programId,
    updatedAt: c.updatedAt.toISOString(),
  }));
}

export type ChatMessageDto = {
  id: string;
  role: string;
  content: string;
  toolCalls: { name: string; summary: string }[];
  proposal: ChatProposal | null;
  proposalStatus: string | null;
};

export type ChatConversationDto = {
  id: string;
  title: string | null;
  programId: string | null;
  messages: ChatMessageDto[];
};

export async function getConversation(
  id: string
): Promise<ChatConversationDto | null> {
  const user = await requireActionUser();
  const conversation = await prisma.chatConversation.findFirst({
    where: { id, userId: user.id },
    include: {
      messages: { orderBy: { createdAt: "asc" }, take: 200 },
    },
  });
  if (!conversation) return null;
  return {
    id: conversation.id,
    title: conversation.title,
    programId: conversation.programId,
    messages: conversation.messages.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      toolCalls: Array.isArray(m.toolCalls)
        ? (m.toolCalls as { name: string; summary: string }[])
        : [],
      proposal: (m.proposal as ChatProposal | null) ?? null,
      proposalStatus: m.proposalStatus,
    })),
  };
}

export async function deleteConversation(id: string): Promise<void> {
  const user = await requireActionUser();
  await prisma.chatConversation.deleteMany({ where: { id, userId: user.id } });
}

export type ChatProgramOption = { id: string; name: string };

// Programmes proposés dans le sélecteur du panneau (actifs, plus récents
// d'abord). Le premier est le choix par défaut d'une nouvelle conversation.
export async function listChatPrograms(): Promise<ChatProgramOption[]> {
  const user = await requireActionUser();
  const programs = await prisma.program.findMany({
    where: { archivedAt: null, userId: user.id },
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true },
  });
  return programs;
}
