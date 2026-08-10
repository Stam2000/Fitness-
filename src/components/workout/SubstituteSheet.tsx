"use client";

import { btn } from "@/components/ui/button";
import Chip from "@/components/ui/Chip";
import BottomSheet from "@/components/ui/BottomSheet";

const REASONS = ["Machine occupée", "Douleur", "Trop dur", "Trop facile"];

/** Feuille basse « Remplacer cet exercice » : raison + alternative IA. */
export default function SubstituteSheet({
  open,
  reason,
  busy,
  error,
  onClose,
  onReason,
  onSubmit,
}: {
  open: boolean;
  reason: string;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onReason: (reason: string) => void;
  onSubmit: () => void;
}) {
  return (
    <BottomSheet open={open} onClose={onClose}>
      <div className="flex flex-col gap-3">
        <div>
          <p className="text-lg font-extrabold">
            Pourquoi remplacer cet exercice ?
          </p>
          <p className="mt-0.5 text-[13px] text-muted-2">
            L&apos;IA propose une alternative avec ton matériel.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {REASONS.map((r) => (
            <Chip
              key={r}
              active={reason === r}
              onClick={() => onReason(reason === r ? "" : r)}
            >
              {reason === r ? "✓ " : ""}
              {r}
            </Chip>
          ))}
        </div>
        <input
          value={REASONS.includes(reason) ? "" : reason}
          onChange={(e) => onReason(e.target.value)}
          placeholder="Ou précise ta raison…"
          className="w-full rounded-full border-[1.5px] border-border bg-surface-2 px-4 py-3 text-sm outline-none focus:border-accent"
        />
        {error && <p className="text-xs text-danger">{error}</p>}
        <button
          onClick={onSubmit}
          disabled={busy}
          className={btn("primary", "lg", "w-full")}
        >
          {busy
            ? "🤖 Recherche d'une alternative…"
            : "🤖 Remplacer par une alternative IA"}
        </button>
        <p className="text-center text-xs text-muted">
          Recherche 10 à 30 s · les séries déjà faites sont conservées
        </p>
      </div>
    </BottomSheet>
  );
}
