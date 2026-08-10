"use client";

import { useEffect, type ReactNode } from "react";

type BottomSheetProps = {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
};

/**
 * Feuille basse mobile (centrée sur md+). Fermeture par clic sur le fond
 * ou touche Échap.
 */
export default function BottomSheet({ open, onClose, children }: BottomSheetProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      <button
        type="button"
        aria-label="Fermer"
        onClick={onClose}
        className="absolute inset-0 bg-black/60"
      />
      <div className="absolute inset-x-0 bottom-0 rounded-t-3xl border-t border-card-border bg-surface p-5 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] md:inset-auto md:left-1/2 md:top-1/2 md:w-full md:max-w-md md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-3xl md:border">
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-border md:hidden" />
        {children}
      </div>
    </div>
  );
}
