"use client";

import { X } from "lucide-react";

/** Chrome haut des écrans repos/échauffement : ✕, jour, progression, compteur. */
export default function SessionHeader({
  dayName,
  doneCount,
  totalSets,
  onAbandon,
}: {
  dayName: string;
  doneCount: number;
  totalSets: number;
  onAbandon: () => void;
}) {
  return (
    <header className="flex items-center gap-3 border-b border-card-border pb-3">
      <button
        onClick={onAbandon}
        aria-label="Abandonner la séance"
        title="Abandonner la séance"
        className="text-muted-2"
      >
        <X size={19} />
      </button>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-bold">{dayName}</p>
        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-2">
          <div
            className="h-full rounded-full bg-accent transition-all"
            style={{ width: `${(doneCount / Math.max(totalSets, 1)) * 100}%` }}
          />
        </div>
      </div>
      <span className="font-mono text-[13px] font-bold text-muted-2">
        {doneCount}/{totalSets}
      </span>
    </header>
  );
}
