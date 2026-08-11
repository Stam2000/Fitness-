"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { ChatProposal } from "@/lib/chat-shared";
import { TOOL_LABELS } from "@/lib/chat-shared";
import {
  applyChatProposal,
  deleteConversation,
  getConversation,
  listChatPrograms,
  listConversations,
  rejectChatProposal,
  type ChatConversationSummary,
  type ChatProgramOption,
} from "@/app/chat-actions";

export type ChatToolChip = {
  id: string;
  name: string;
  label: string;
  summary?: string;
  done: boolean;
};

export type ChatItem = {
  id: string; // id provisoire côté client, remplacé par l'id BDD au « done »
  role: "user" | "assistant";
  content: string;
  tools: ChatToolChip[];
  proposal: ChatProposal | null;
  proposalStatus: string | null;
  error: string | null;
  streaming: boolean;
};

const CONVERSATION_KEY = "chat-conversation";

let tempId = 0;
const nextTempId = () => `tmp-${++tempId}`;

// État complet du panneau d'assistant : conversation courante, streaming SSE,
// sélection de programme, propositions. Chargé paresseusement à l'ouverture.
export function useChat(open: boolean) {
  const router = useRouter();
  const [items, setItems] = useState<ChatItem[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [programs, setPrograms] = useState<ChatProgramOption[]>([]);
  const [programId, setProgramId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<ChatConversationSummary[]>(
    []
  );
  const [streaming, setStreaming] = useState(false);
  const [proposalBusy, setProposalBusy] = useState<string | null>(null);
  const loaded = useRef(false);
  const abortRef = useRef<AbortController | null>(null);

  // Liste des programmes rafraîchie à chaque ouverture du panneau (un
  // programme créé entre-temps apparaît dans le sélecteur).
  useEffect(() => {
    if (!open) return;
    listChatPrograms()
      .then(setPrograms)
      .catch(() => {});
  }, [open]);

  // Premier chargement à l'ouverture du panneau : dernière conversation
  // utilisée (si elle existe encore), sinon programme actif par défaut.
  useEffect(() => {
    if (!open || loaded.current) return;
    loaded.current = true;
    (async () => {
      const progs = await listChatPrograms().catch(() => []);
      const storedId = localStorage.getItem(CONVERSATION_KEY);
      if (storedId) {
        const conv = await getConversation(storedId).catch(() => null);
        if (conv) {
          setConversationId(conv.id);
          setProgramId(conv.programId);
          setItems(
            conv.messages.map((m) => ({
              id: m.id,
              role: m.role === "user" ? "user" : "assistant",
              content: m.content,
              tools: m.toolCalls.map((t, i) => ({
                id: `${m.id}-${i}`,
                name: t.name,
                label: TOOL_LABELS[t.name] ?? t.name,
                summary: t.summary,
                done: true,
              })),
              proposal: m.proposal,
              proposalStatus: m.proposalStatus,
              error: null,
              streaming: false,
            }))
          );
          return;
        }
        localStorage.removeItem(CONVERSATION_KEY);
      }
      setProgramId((current) => current ?? progs[0]?.id ?? null);
    })();
  }, [open]);

  const stop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);

  const updateLast = useCallback(
    (patch: (item: ChatItem) => ChatItem) => {
      setItems((prev) => {
        if (prev.length === 0) return prev;
        const next = [...prev];
        next[next.length - 1] = patch(next[next.length - 1]);
        return next;
      });
    },
    []
  );

  const sendMessage = useCallback(
    async (text: string) => {
      const message = text.trim();
      if (!message || streaming) return;
      stop();
      const controller = new AbortController();
      abortRef.current = controller;
      setStreaming(true);
      setItems((prev) => [
        ...prev,
        {
          id: nextTempId(),
          role: "user",
          content: message,
          tools: [],
          proposal: null,
          proposalStatus: null,
          error: null,
          streaming: false,
        },
        {
          id: nextTempId(),
          role: "assistant",
          content: "",
          tools: [],
          proposal: null,
          proposalStatus: null,
          error: null,
          streaming: true,
        },
      ]);

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            conversationId: conversationId ?? undefined,
            message,
            programId,
          }),
          signal: controller.signal,
        });
        if (!res.ok || !res.body) {
          const json = await res.json().catch(() => null);
          updateLast((item) => ({
            ...item,
            streaming: false,
            error:
              (json as { error?: string } | null)?.error ??
              "L'assistant est indisponible. Réessaie.",
          }));
          return;
        }

        const reader = res.body.getReader();
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
            let event: Record<string, unknown>;
            try {
              event = JSON.parse(line.slice(5).trim());
            } catch {
              continue;
            }
            switch (event.type) {
              case "meta": {
                const id = event.conversationId as string;
                setConversationId(id);
                localStorage.setItem(CONVERSATION_KEY, id);
                break;
              }
              case "text-delta":
                updateLast((item) => ({
                  ...item,
                  content: item.content + (event.delta as string),
                }));
                break;
              case "tool-start":
                updateLast((item) => ({
                  ...item,
                  tools: [
                    ...item.tools,
                    {
                      id: event.id as string,
                      name: event.name as string,
                      label: (event.label as string) ?? (event.name as string),
                      done: false,
                    },
                  ],
                }));
                break;
              case "tool-result":
                updateLast((item) => ({
                  ...item,
                  tools: item.tools.map((t) =>
                    t.id === event.id
                      ? { ...t, done: true, summary: event.summary as string }
                      : t
                  ),
                }));
                break;
              case "proposal":
                updateLast((item) => ({
                  ...item,
                  proposal: event.proposal as ChatProposal,
                  proposalStatus: "pending",
                }));
                break;
              case "error":
                updateLast((item) => ({
                  ...item,
                  error: event.message as string,
                }));
                break;
              case "done": {
                const dbId = event.assistantMessageId as string | null;
                updateLast((item) => ({
                  ...item,
                  id: dbId ?? item.id,
                  streaming: false,
                }));
                break;
              }
            }
          }
        }
      } catch (e) {
        if ((e as Error).name !== "AbortError") {
          updateLast((item) => ({
            ...item,
            streaming: false,
            error: "La connexion à l'assistant a été interrompue.",
          }));
        }
      } finally {
        updateLast((item) => ({ ...item, streaming: false }));
        setStreaming(false);
        if (abortRef.current === controller) abortRef.current = null;
      }
    },
    [conversationId, programId, streaming, stop, updateLast]
  );

  const applyProposal = useCallback(
    async (messageId: string) => {
      setProposalBusy(messageId);
      try {
        const result = await applyChatProposal(messageId);
        setItems((prev) =>
          prev.map((item) =>
            item.id === messageId
              ? {
                  ...item,
                  proposalStatus: result.ok ? "applied" : item.proposalStatus,
                  error: result.ok ? null : result.error,
                }
              : item
          )
        );
        if (result.ok) {
          // La page visible (programme, accueil) reflète la modification.
          router.refresh();
        } else if (result.error.startsWith("La proposition n'est plus")) {
          setItems((prev) =>
            prev.map((item) =>
              item.id === messageId ? { ...item, proposalStatus: "stale" } : item
            )
          );
        }
      } finally {
        setProposalBusy(null);
      }
    },
    [router]
  );

  const rejectProposal = useCallback(async (messageId: string) => {
    setProposalBusy(messageId);
    try {
      await rejectChatProposal(messageId);
      setItems((prev) =>
        prev.map((item) =>
          item.id === messageId ? { ...item, proposalStatus: "rejected" } : item
        )
      );
    } finally {
      setProposalBusy(null);
    }
  }, []);

  const newConversation = useCallback(() => {
    stop();
    setItems([]);
    setConversationId(null);
    localStorage.removeItem(CONVERSATION_KEY);
    setProgramId((current) => current ?? programs[0]?.id ?? null);
  }, [programs, stop]);

  const openConversation = useCallback(
    async (id: string) => {
      stop();
      const conv = await getConversation(id).catch(() => null);
      if (!conv) return;
      setConversationId(conv.id);
      localStorage.setItem(CONVERSATION_KEY, conv.id);
      setProgramId(conv.programId);
      setItems(
        conv.messages.map((m) => ({
          id: m.id,
          role: m.role === "user" ? "user" : "assistant",
          content: m.content,
          tools: m.toolCalls.map((t, i) => ({
            id: `${m.id}-${i}`,
            name: t.name,
            label: TOOL_LABELS[t.name] ?? t.name,
            summary: t.summary,
            done: true,
          })),
          proposal: m.proposal,
          proposalStatus: m.proposalStatus,
          error: null,
          streaming: false,
        }))
      );
    },
    [stop]
  );

  const refreshConversations = useCallback(async () => {
    setConversations(await listConversations().catch(() => []));
  }, []);

  const removeConversation = useCallback(
    async (id: string) => {
      await deleteConversation(id);
      setConversations((prev) => prev.filter((c) => c.id !== id));
      if (id === conversationId) newConversation();
    },
    [conversationId, newConversation]
  );

  return {
    items,
    streaming,
    programs,
    programId,
    setProgramId,
    conversations,
    refreshConversations,
    conversationId,
    sendMessage,
    stop,
    applyProposal,
    rejectProposal,
    proposalBusy,
    newConversation,
    openConversation,
    removeConversation,
  };
}
