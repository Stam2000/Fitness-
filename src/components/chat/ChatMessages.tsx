"use client";

import { useEffect, useRef } from "react";
import { Bot, Check, Loader2 } from "lucide-react";
import RenderText from "@/components/chat/renderText";
import ProposalCard from "@/components/chat/ProposalCard";
import type { ChatItem } from "@/components/chat/useChat";

const SUGGESTIONS = [
  "Analyse ma progression récente",
  "Propose un exercice de remplacement",
  "Adapte mon programme",
];

type ChatMessagesProps = {
  items: ChatItem[];
  proposalBusy: string | null;
  onApply: (messageId: string) => void;
  onReject: (messageId: string) => void;
  onSuggestion: (text: string) => void;
};

export default function ChatMessages({
  items,
  proposalBusy,
  onApply,
  onReject,
  onSuggestion,
}: ChatMessagesProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);

  // Suivi du scroll : on ne colle au bas que si l'utilisateur n'a pas remonté.
  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    stickToBottom.current =
      el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  };

  useEffect(() => {
    const el = scrollRef.current;
    if (el && stickToBottom.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [items]);

  if (items.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent/10">
          <Bot size={24} className="text-accent" />
        </div>
        <div>
          <p className="font-semibold">Ton coach connaît tes programmes.</p>
          <p className="mt-1 text-sm text-muted">
            Pose une question ou demande une modification — rien n’est appliqué
            sans ta confirmation.
          </p>
        </div>
        <div className="flex flex-col gap-2">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => onSuggestion(s)}
              className="rounded-full border-[1.5px] border-border px-4 py-2 text-sm text-muted transition-colors hover:border-accent/50 hover:text-ink"
            >
              {s}
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div
      ref={scrollRef}
      onScroll={onScroll}
      className="flex-1 space-y-4 overflow-y-auto px-4 py-4"
    >
      {items.map((item) =>
        item.role === "user" ? (
          <div key={item.id} className="flex justify-end">
            <div className="max-w-[85%] rounded-2xl rounded-br-md bg-surface-2 px-3.5 py-2.5 text-sm">
              <p className="whitespace-pre-wrap">{item.content}</p>
            </div>
          </div>
        ) : (
          <div key={item.id} className="text-sm leading-relaxed">
            {item.tools.length > 0 && (
              <div className="mb-2 flex flex-col gap-1">
                {item.tools.map((tool) => (
                  <span
                    key={tool.id}
                    className="inline-flex items-center gap-1.5 text-xs text-muted-2"
                  >
                    {tool.done ? (
                      <Check size={13} className="shrink-0 text-accent" />
                    ) : (
                      <Loader2
                        size={13}
                        className="shrink-0 animate-spin text-accent"
                      />
                    )}
                    {tool.label}
                    {tool.done && tool.summary ? ` — ${tool.summary}` : "…"}
                  </span>
                ))}
              </div>
            )}
            {item.content ? (
              <RenderText text={item.content} />
            ) : item.streaming && item.tools.length === 0 ? (
              <span className="inline-flex items-center gap-2 text-muted-2">
                <Loader2 size={14} className="animate-spin" /> Réflexion…
              </span>
            ) : null}
            {item.proposal && (
              <ProposalCard
                proposal={item.proposal}
                status={item.proposalStatus}
                messageId={item.streaming ? null : item.id}
                busy={proposalBusy === item.id}
                onApply={onApply}
                onReject={onReject}
              />
            )}
            {item.error && (
              <p className="mt-2 rounded-xl border-[1.5px] border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">
                {item.error}
              </p>
            )}
          </div>
        )
      )}
    </div>
  );
}
