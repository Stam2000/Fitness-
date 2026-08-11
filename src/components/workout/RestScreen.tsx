"use client";

import type { ReactNode } from "react";
import { ArrowRightToLine, Flag, PencilLine, SkipForward } from "lucide-react";
import { btn } from "@/components/ui/button";
import SessionHeader from "@/components/workout/SessionHeader";
import NextUpCard, { type NextUpInfo } from "@/components/workout/NextUpCard";

/** Repos plein écran : gros timer mono, +30 s / Passer, saisie, « Ensuite ». */
export default function RestScreen({
  restLeft,
  kind = "rest",
  dayName,
  doneCount,
  totalSets,
  nextUp,
  logPanel = null,
  logTitle,
  onAbandon,
  onExtend,
  onSkip,
  onFinishNow,
}: {
  restLeft: number;
  /** rest = entre séries ; transition = passage à l'exercice suivant. */
  kind?: "rest" | "transition";
  dayName: string;
  doneCount: number;
  totalSets: number;
  nextUp: NextUpInfo | null;
  /** Saisie des séries de l'exercice courant (SetLogPanel). */
  logPanel?: ReactNode;
  /** Titre de la carte de saisie (nom de l'exercice concerné). */
  logTitle?: string;
  onAbandon: () => void;
  onExtend: () => void;
  onSkip: () => void;
  onFinishNow: () => void;
}) {
  // Avec la saisie affichée, le timer géant mangerait tout l'écran mobile.
  const dense = logPanel !== null;
  return (
    <main
      className={`mx-auto flex w-full max-w-md flex-col gap-4 ${
        dense ? "" : "min-h-[calc(100dvh-7rem)]"
      }`}
    >
      <SessionHeader
        dayName={dayName}
        doneCount={doneCount}
        totalSets={totalSets}
        onAbandon={onAbandon}
      />
      <div className="flex flex-1 flex-col justify-center gap-4">
        <div
          className={`rounded-3xl border-[1.5px] border-accent/50 bg-accent/[0.08] px-5 text-center ${
            dense ? "py-5" : "py-8"
          }`}
        >
          <p className="overline-label flex items-center justify-center gap-1.5 tracking-[0.16em] text-accent">
            {kind === "transition" ? (
              <>
                <ArrowRightToLine size={13} /> Transition
              </>
            ) : (
              "Repos"
            )}
          </p>
          <p
            className={`my-3 font-mono font-black leading-none tabular-nums ${
              dense ? "text-[56px]" : "my-4 text-[84px]"
            }`}
          >
            {Math.floor(restLeft / 60)}:{String(restLeft % 60).padStart(2, "0")}
          </p>
          <div className="flex justify-center gap-2.5">
            <button onClick={onExtend} className={btn("outline", "lg")}>
              +30 s
            </button>
            <button
              onClick={onSkip}
              aria-label="Passer le repos"
              title="Passer le repos"
              className={btn("primary", "lg")}
            >
              <SkipForward size={19} fill="currentColor" />
            </button>
          </div>
        </div>

        {logPanel && (
          <section className="card p-3.5">
            <p className="overline-label mb-2.5 flex items-center gap-1.5 text-accent">
              <PencilLine size={13} /> Saisie
              {logTitle ? <span className="text-muted"> · {logTitle}</span> : null}
            </p>
            {logPanel}
          </section>
        )}

        {nextUp && <NextUpCard nextUp={nextUp} />}
      </div>
      <button
        onClick={onFinishNow}
        className="inline-flex items-center justify-center gap-1.5 pb-2 text-center text-[13px] font-semibold text-muted"
      >
        <Flag size={13} /> Terminer maintenant
      </button>
    </main>
  );
}
