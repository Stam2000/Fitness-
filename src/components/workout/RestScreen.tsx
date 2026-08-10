"use client";

import { btn } from "@/components/ui/button";
import SessionHeader from "@/components/workout/SessionHeader";
import NextUpCard, { type NextUpInfo } from "@/components/workout/NextUpCard";

/** Repos plein écran : gros timer mono, +30 s / Passer, carte « Ensuite ». */
export default function RestScreen({
  restLeft,
  dayName,
  doneCount,
  totalSets,
  nextUp,
  onAbandon,
  onExtend,
  onSkip,
  onFinishNow,
}: {
  restLeft: number;
  dayName: string;
  doneCount: number;
  totalSets: number;
  nextUp: NextUpInfo | null;
  onAbandon: () => void;
  onExtend: () => void;
  onSkip: () => void;
  onFinishNow: () => void;
}) {
  return (
    <main className="mx-auto flex min-h-[calc(100dvh-7rem)] w-full max-w-md flex-col gap-4">
      <SessionHeader
        dayName={dayName}
        doneCount={doneCount}
        totalSets={totalSets}
        onAbandon={onAbandon}
      />
      <div className="flex flex-1 flex-col justify-center gap-4">
        <div className="rounded-3xl border-[1.5px] border-accent/50 bg-accent/[0.08] px-5 py-8 text-center">
          <p className="overline-label tracking-[0.16em] text-accent">Repos</p>
          <p className="my-4 font-mono text-[84px] font-black leading-none tabular-nums">
            {Math.floor(restLeft / 60)}:{String(restLeft % 60).padStart(2, "0")}
          </p>
          <div className="flex justify-center gap-2.5">
            <button onClick={onExtend} className={btn("outline", "lg")}>
              +30 s
            </button>
            <button onClick={onSkip} className={btn("primary", "lg")}>
              Passer ▶
            </button>
          </div>
        </div>
        {nextUp && <NextUpCard nextUp={nextUp} />}
      </div>
      <button
        onClick={onFinishNow}
        className="pb-2 text-center text-[13px] font-semibold text-muted"
      >
        Terminer la séance maintenant
      </button>
    </main>
  );
}
