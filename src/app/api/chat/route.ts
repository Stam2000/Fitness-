import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSettings } from "@/lib/settings";
import { chatCompletion } from "@/lib/openrouter";
import { renderProgramText } from "@/lib/program-text";
import {
  CHAT_TOOLS,
  TOOL_LABELS,
  executeChatTool,
  type ChatProposal,
  type ChatToolOutcome,
  type ChatToolTrace,
} from "@/lib/chat-tools";
import type { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  conversationId: z.string().optional(),
  message: z.string().min(1).max(4000),
  // null = conversation explicitement sans programme ; absent = inchangé.
  programId: z.string().nullable().optional(),
});

const MAX_ITERATIONS = 6;
const HISTORY_LIMIT = 30;

type ModelMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: {
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }[];
  tool_call_id?: string;
};

const STATUS_NOTES: Record<string, string> = {
  applied: "[Proposition appliquée par l'utilisateur]",
  rejected: "[Proposition annulée par l'utilisateur]",
  stale: "[Proposition devenue obsolète (programme modifié entre-temps)]",
  pending: "[Proposition en attente de confirmation]",
};

async function buildSystemPrompt(programId: string | null): Promise<string> {
  const parts: string[] = [
    `Tu es le coach de l'application « Mon Coach Fitness ». Tu réponds en français, de façon directe et concrète.

Modèle de données : l'utilisateur a des programmes (composés de jours, eux-mêmes composés d'exercices ; un exercice peut avoir jusqu'à 2 variantes jouées en rotation). Les séances terminées enregistrent les séries réalisées (charge, répétitions). Un programme se déroule en blocs de plusieurs cycles ; un programme archivé a été remplacé par son bloc suivant.

Outils : utilise les outils de lecture (list_programs, get_program, get_progress) pour répondre précisément — ne devine jamais le contenu d'un programme. Pour toute modification (éditer le programme, remplacer un exercice, créer des variantes), utilise les outils propose_* : ils préparent une proposition que l'utilisateur confirme ou annule dans le panneau. Ne prétends JAMAIS qu'une modification est faite tant qu'elle n'a pas été confirmée. Une seule proposition par réponse. Les ids d'exercices s'obtiennent via get_program.

Format : texte brut uniquement. Autorisés : listes commençant par « - », **gras**, \`code\`. Pas de titres #, pas de tableaux.`,
  ];
  if (programId) {
    const program = await prisma.program.findUnique({
      where: { id: programId },
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
    if (program) {
      parts.push(
        `Programme sélectionné par l'utilisateur (id : ${program.id}) :\n\n${renderProgramText(program)}`
      );
    }
  } else {
    parts.push(
      "Aucun programme n'est sélectionné : si la question porte sur un programme, appelle list_programs pour trouver le bon."
    );
  }
  return parts.join("\n\n");
}

// Reconstruit l'historique de la conversation au format du modèle.
function historyToModelMessages(
  history: {
    role: string;
    content: string;
    toolCalls: unknown;
    proposalStatus: string | null;
  }[]
): ModelMessage[] {
  return history.map((m) => {
    if (m.role === "user") {
      return { role: "user" as const, content: m.content };
    }
    let content = m.content;
    const traces = Array.isArray(m.toolCalls)
      ? (m.toolCalls as ChatToolTrace[])
      : [];
    if (traces.length > 0) {
      content += `\n[Outils utilisés : ${traces.map((t) => `${t.name} (${t.summary})`).join(" ; ")}]`;
    }
    if (m.proposalStatus) {
      content += `\n${STATUS_NOTES[m.proposalStatus] ?? ""}`;
    }
    return { role: "assistant" as const, content };
  });
}

export async function POST(req: NextRequest) {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Requête invalide" }, { status: 400 });
  }
  const settings = await getSettings();
  if (!settings.openrouterApiKey) {
    return NextResponse.json(
      { error: "Aucune clé OpenRouter configurée (Réglages)." },
      { status: 400 }
    );
  }
  const apiKey = settings.openrouterApiKey;

  const { conversationId, message, programId } = parsed.data;

  let conversation = conversationId
    ? await prisma.chatConversation.findUnique({ where: { id: conversationId } })
    : null;
  if (conversation) {
    if (programId !== undefined && programId !== conversation.programId) {
      conversation = await prisma.chatConversation.update({
        where: { id: conversation.id },
        data: { programId },
      });
    }
  } else {
    conversation = await prisma.chatConversation.create({
      data: {
        title: message.length > 60 ? `${message.slice(0, 57)}…` : message,
        programId: programId ?? null,
      },
    });
  }
  const conv = conversation;

  const userMessage = await prisma.chatMessage.create({
    data: { conversationId: conv.id, role: "user", content: message },
  });

  // L'historique inclut le message utilisateur qui vient d'être créé.
  const historyDesc = await prisma.chatMessage.findMany({
    where: { conversationId: conv.id },
    orderBy: { createdAt: "desc" },
    take: HISTORY_LIMIT,
  });
  const history = historyDesc.reverse();

  const systemPrompt = await buildSystemPrompt(conv.programId);
  const modelMessages: ModelMessage[] = [
    { role: "system", content: systemPrompt },
    ...historyToModelMessages(history),
  ];

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;
      const send = (obj: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
        } catch {
          closed = true;
        }
      };
      // Certains proxys coupent les connexions silencieuses : commentaire SSE
      // périodique pendant les outils longs (appels LLM imbriqués).
      const heartbeat = setInterval(() => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`: ping\n\n`));
        } catch {
          closed = true;
        }
      }, 15000);

      const textParts: string[] = [];
      const traces: ChatToolTrace[] = [];
      let proposal: ChatProposal | null = null;

      try {
        send({
          type: "meta",
          conversationId: conv.id,
          userMessageId: userMessage.id,
        });

        for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
          const res = await chatCompletion({
            apiKey,
            model: settings.openrouterModel,
            messages: modelMessages,
            tools: CHAT_TOOLS,
            stream: true,
            signal: req.signal,
          });
          if (!res.ok) {
            const bodyText = await res.text().catch(() => "");
            const noTools =
              res.status === 404 || /tool/i.test(bodyText);
            send({
              type: "error",
              message: noTools
                ? "Ce modèle ne prend pas en charge les outils — choisis-en un autre dans Réglages."
                : `Erreur OpenRouter (${res.status})`,
            });
            break;
          }

          // Lecture du flux SSE OpenRouter : deltas de texte + tool calls.
          let iterationText = "";
          const toolCalls = new Map<
            number,
            { id: string; name: string; args: string }
          >();
          let finishReason: string | null = null;

          const reader = res.body!.getReader();
          const decoder = new TextDecoder();
          let buffer = "";
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() ?? "";
            for (const rawLine of lines) {
              const line = rawLine.trim();
              if (!line.startsWith("data:")) continue;
              const payload = line.slice(5).trim();
              if (payload === "[DONE]") continue;
              let json: {
                choices?: {
                  delta?: {
                    content?: string | null;
                    tool_calls?: {
                      index: number;
                      id?: string;
                      function?: { name?: string; arguments?: string };
                    }[];
                  };
                  finish_reason?: string | null;
                }[];
              };
              try {
                json = JSON.parse(payload);
              } catch {
                continue;
              }
              const choice = json.choices?.[0];
              if (!choice) continue;
              if (choice.delta?.content) {
                iterationText += choice.delta.content;
                send({ type: "text-delta", delta: choice.delta.content });
              }
              for (const tc of choice.delta?.tool_calls ?? []) {
                const entry = toolCalls.get(tc.index) ?? {
                  id: "",
                  name: "",
                  args: "",
                };
                if (tc.id) entry.id = tc.id;
                if (tc.function?.name) entry.name += tc.function.name;
                if (tc.function?.arguments) entry.args += tc.function.arguments;
                toolCalls.set(tc.index, entry);
              }
              if (choice.finish_reason) finishReason = choice.finish_reason;
            }
          }

          if (iterationText) textParts.push(iterationText);

          if (finishReason !== "tool_calls" || toolCalls.size === 0) {
            break;
          }

          const calls = [...toolCalls.entries()]
            .sort((a, b) => a[0] - b[0])
            .map(([, c]) => c);
          modelMessages.push({
            role: "assistant",
            content: iterationText || null,
            tool_calls: calls.map((c) => ({
              id: c.id,
              type: "function" as const,
              function: { name: c.name, arguments: c.args },
            })),
          });

          for (const call of calls) {
            send({
              type: "tool-start",
              id: call.id,
              name: call.name,
              label: TOOL_LABELS[call.name] ?? call.name,
            });
            let args: unknown = {};
            try {
              args = call.args ? JSON.parse(call.args) : {};
            } catch {
              args = null;
            }
            const outcome: ChatToolOutcome =
              args === null
                ? {
                    result: "Erreur : arguments JSON invalides.",
                    summary: "Arguments invalides",
                  }
                : await executeChatTool(call.name, args, proposal !== null);
            traces.push({
              name: call.name,
              args: (args ?? {}) as Record<string, unknown>,
              summary: outcome.summary,
            });
            send({
              type: "tool-result",
              id: call.id,
              name: call.name,
              summary: outcome.summary,
            });
            if ("proposal" in outcome && outcome.proposal) {
              proposal = outcome.proposal;
              send({ type: "proposal", proposal });
            }
            modelMessages.push({
              role: "tool",
              content: outcome.result,
              tool_call_id: call.id,
            });
          }
        }
      } catch (e) {
        if (!req.signal.aborted) {
          console.error("chat:", e);
          send({
            type: "error",
            message: "La conversation a été interrompue par une erreur. Réessaie.",
          });
        }
      } finally {
        clearInterval(heartbeat);
        const content = textParts.join("\n\n");
        if (content || traces.length > 0 || proposal) {
          try {
            const assistantMessage = await prisma.chatMessage.create({
              data: {
                conversationId: conv.id,
                role: "assistant",
                content,
                toolCalls:
                  traces.length > 0
                    ? (traces as unknown as Prisma.InputJsonValue)
                    : undefined,
                proposal: proposal
                  ? (proposal as unknown as Prisma.InputJsonValue)
                  : undefined,
                proposalStatus: proposal ? "pending" : undefined,
              },
            });
            await prisma.chatConversation.update({
              where: { id: conv.id },
              data: { updatedAt: new Date() },
            });
            send({ type: "done", assistantMessageId: assistantMessage.id });
          } catch (e) {
            console.error("chat persist:", e);
            send({
              type: "error",
              message: "La réponse n'a pas pu être enregistrée.",
            });
          }
        } else {
          send({ type: "done", assistantMessageId: null });
        }
        try {
          controller.close();
        } catch {
          // déjà fermé (client parti)
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
