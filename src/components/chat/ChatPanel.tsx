"use client";

import { useState } from "react";
import { Bot, History, Plus, Trash2, X } from "lucide-react";
import IconButton from "@/components/ui/IconButton";
import { useChatPanel } from "@/components/chat/ChatProvider";
import { useChat } from "@/components/chat/useChat";
import ChatMessages from "@/components/chat/ChatMessages";
import ChatComposer from "@/components/chat/ChatComposer";

/**
 * Panneau d'assistant IA :
 * - lg+ : colonne fixe à droite (24rem) qui « pousse » le contenu (voir
 *   ChatShell), toujours montée pour animer l'ouverture/fermeture ;
 * - < lg : plein écran par-dessus l'app (trop étroit pour pousser).
 */
export default function ChatPanel() {
  const { open, setOpen } = useChatPanel();
  const chat = useChat(open);
  const [historyOpen, setHistoryOpen] = useState(false);

  return (
    <aside
      aria-label="Assistant IA"
      aria-hidden={!open}
      inert={!open}
      className={`fixed inset-y-0 right-0 z-50 flex w-full flex-col border-l border-card-border bg-surface pb-[env(safe-area-inset-bottom)] transition-transform duration-300 ease-out lg:w-[24rem] ${
        open ? "translate-x-0" : "translate-x-full"
      }`}
    >
      <header className="relative flex items-center gap-1.5 border-b border-card-border px-4 py-3">
        <Bot size={18} className="text-accent" />
        <span className="flex-1 text-sm font-extrabold">Assistant</span>
        <IconButton
          aria-label="Nouvelle conversation"
          variant="ghost"
          size="sm"
          onClick={() => {
            setHistoryOpen(false);
            chat.newConversation();
          }}
        >
          <Plus size={17} />
        </IconButton>
        <IconButton
          aria-label="Historique des conversations"
          variant="ghost"
          size="sm"
          onClick={() => {
            if (!historyOpen) chat.refreshConversations();
            setHistoryOpen((o) => !o);
          }}
        >
          <History size={17} />
        </IconButton>
        <IconButton
          aria-label="Fermer le panneau"
          variant="ghost"
          size="sm"
          onClick={() => setOpen(false)}
        >
          <X size={17} />
        </IconButton>

        {historyOpen && (
          <div className="absolute inset-x-3 top-full z-10 mt-2 max-h-72 overflow-y-auto rounded-2xl border border-card-border bg-surface-2 p-2 shadow-xl">
            {chat.conversations.length === 0 ? (
              <p className="px-3 py-4 text-center text-sm text-muted">
                Aucune conversation enregistrée.
              </p>
            ) : (
              chat.conversations.map((c) => (
                <div
                  key={c.id}
                  className={`flex items-center gap-1 rounded-xl px-1 ${
                    c.id === chat.conversationId ? "bg-accent/[0.08]" : ""
                  }`}
                >
                  <button
                    type="button"
                    className="flex-1 truncate px-2 py-2.5 text-left text-sm text-ink hover:text-accent"
                    onClick={() => {
                      chat.openConversation(c.id);
                      setHistoryOpen(false);
                    }}
                  >
                    {c.title ?? "Conversation"}
                  </button>
                  <IconButton
                    aria-label="Supprimer la conversation"
                    variant="ghost"
                    size="sm"
                    onClick={() => chat.removeConversation(c.id)}
                  >
                    <Trash2 size={15} />
                  </IconButton>
                </div>
              ))
            )}
          </div>
        )}
      </header>

      <div className="flex items-center gap-2 border-b border-card-border px-4 py-2">
        <span className="overline-label shrink-0">Programme</span>
        <select
          value={chat.programId ?? ""}
          onChange={(e) => chat.setProgramId(e.target.value || null)}
          className="w-full min-w-0 flex-1 truncate rounded-lg border border-transparent bg-transparent py-1 text-sm text-ink outline-none transition-colors hover:border-border focus:border-accent/60"
        >
          <option value="">Aucun programme</option>
          {chat.programs.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      <ChatMessages
        items={chat.items}
        proposalBusy={chat.proposalBusy}
        onApply={chat.applyProposal}
        onReject={chat.rejectProposal}
        onSuggestion={chat.sendMessage}
      />

      <ChatComposer disabled={chat.streaming} onSend={chat.sendMessage} />
    </aside>
  );
}
