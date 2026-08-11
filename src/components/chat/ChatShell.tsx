"use client";

import type { ReactNode } from "react";
import { useChatPanel } from "@/components/chat/ChatProvider";

// Conteneur principal des pages : réserve la place de la barre latérale à
// gauche et, quand le panneau d'assistant est ouvert (lg+), sa largeur à
// droite — le contenu est « poussé » et se recentre dans l'espace restant.
export default function ChatShell({ children }: { children: ReactNode }) {
  const { open } = useChatPanel();
  return (
    <div
      className={`flex-1 transition-[padding] duration-300 ease-out md:pl-[4.5rem] lg:pl-60${
        open ? " lg:pr-[24rem]" : ""
      }`}
    >
      <div className="mx-auto w-full max-w-lg px-4 pt-4 safe-bottom md:max-w-3xl md:px-6 md:pt-8 xl:max-w-5xl lg:px-8">
        {children}
      </div>
    </div>
  );
}
