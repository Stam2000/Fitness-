"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

type ChatPanelContextValue = {
  open: boolean;
  setOpen: (open: boolean) => void;
  toggle: () => void;
};

const ChatPanelContext = createContext<ChatPanelContextValue | null>(null);

export function useChatPanel(): ChatPanelContextValue {
  const ctx = useContext(ChatPanelContext);
  if (!ctx) {
    throw new Error("useChatPanel doit être utilisé sous ChatProvider");
  }
  return ctx;
}

// État ouvert/fermé du panneau d'assistant, partagé entre la nav, le shell
// (padding « push ») et le panneau lui-même.
export default function ChatProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const restored = useRef(false);

  // Restauration post-mount uniquement (pas de mismatch d'hydratation) et
  // seulement en mode « push » : jamais d'auto-ouverture du plein écran mobile.
  useEffect(() => {
    if (
      window.matchMedia("(min-width: 1024px)").matches &&
      localStorage.getItem("chat-open") === "1"
    ) {
      // Lecture unique de localStorage au mount : impossible dans
      // l'initialiseur d'état sans mismatch d'hydratation (le serveur rend
      // toujours fermé).
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setOpen(true);
    }
    restored.current = true;
  }, []);

  useEffect(() => {
    if (!restored.current) return;
    localStorage.setItem("chat-open", open ? "1" : "0");
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <ChatPanelContext.Provider
      value={{ open, setOpen, toggle: () => setOpen((o) => !o) }}
    >
      {children}
    </ChatPanelContext.Provider>
  );
}
