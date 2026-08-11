"use client";

import { Flame, Loader2, WandSparkles } from "lucide-react";
import { btn } from "@/components/ui/button";
import Chip from "@/components/ui/Chip";
import SessionHeader from "@/components/workout/SessionHeader";
import NextUpCard, { type NextUpInfo } from "@/components/workout/NextUpCard";

type WarmupMove = { name: string; seconds: number };

/**
 * Échauffement plein écran (palette orange) : choix de durée puis timer géant
 * avec la liste des mouvements de l'échauffement IA.
 */
export default function WarmupScreen({
  warmupLeft,
  aiWarmup,
  aiWarmupLoading,
  aiWarmupError,
  hasOpenrouterKey,
  dayName,
  doneCount,
  totalSets,
  nextUp,
  onAbandon,
  onStart,
  onLoadAi,
  onExtend,
  onFinish,
}: {
  warmupLeft: number | null;
  aiWarmup: WarmupMove[] | null;
  aiWarmupLoading: boolean;
  aiWarmupError: string | null;
  hasOpenrouterKey: boolean;
  dayName: string;
  doneCount: number;
  totalSets: number;
  nextUp: NextUpInfo | null;
  onAbandon: () => void;
  onStart: (seconds: number) => void;
  onLoadAi: () => void;
  onExtend: () => void;
  onFinish: () => void;
}) {
  // Mouvement en cours, dérivé du temps restant (pas d'état supplémentaire).
  let currentMove = -1;
  if (aiWarmup && warmupLeft !== null) {
    const total = aiWarmup.reduce((acc, m) => acc + m.seconds, 0);
    const elapsed = Math.max(0, total - warmupLeft);
    let cumul = 0;
    for (let i = 0; i < aiWarmup.length; i++) {
      cumul += aiWarmup[i].seconds;
      if (elapsed < cumul) {
        currentMove = i;
        break;
      }
    }
    if (currentMove === -1) currentMove = aiWarmup.length - 1;
  }

  return (
    <main className="mx-auto flex min-h-[calc(100dvh-7rem)] w-full max-w-md flex-col gap-4">
      <SessionHeader
        dayName={dayName}
        doneCount={doneCount}
        totalSets={totalSets}
        onAbandon={onAbandon}
      />
      <div className="flex flex-1 flex-col justify-center gap-3.5">
        {warmupLeft === null ? (
          <div className="rounded-3xl border-[1.5px] border-warm/50 bg-warm/[0.08] px-5 py-8 text-center">
            <p className="overline-label flex items-center justify-center gap-1.5 tracking-[0.14em] text-warm-light">
              <Flame size={14} /> Échauffement ?
            </p>
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              {[2, 5, 10].map((min) => (
                <Chip key={min} tone="warm" active onClick={() => onStart(min * 60)}>
                  {min} min
                </Chip>
              ))}
              {hasOpenrouterKey && (
                <Chip tone="warm" active disabled={aiWarmupLoading} onClick={onLoadAi}>
                  {aiWarmupLoading ? (
                    <Loader2 size={15} className="animate-spin" />
                  ) : (
                    <WandSparkles size={15} />
                  )}{" "}
                  Sur mesure
                </Chip>
              )}
              <Chip onClick={onFinish}>Passer</Chip>
            </div>
            {aiWarmupError && (
              <p className="mt-3 text-xs text-danger">{aiWarmupError}</p>
            )}
          </div>
        ) : (
          <div className="rounded-3xl border-[1.5px] border-warm/50 bg-warm/[0.08] px-5 py-6 text-center">
            <p className="overline-label flex items-center justify-center gap-1.5 tracking-[0.14em] text-warm-light">
              <Flame size={14} /> Échauffement{aiWarmup ? " · Sur mesure" : ""}
            </p>
            <p className="my-3 font-mono text-[72px] font-black leading-none tabular-nums">
              {Math.floor(warmupLeft / 60)}:
              {String(warmupLeft % 60).padStart(2, "0")}
            </p>
            {aiWarmup && (
              <ul className="mx-auto mb-4 flex max-w-xs flex-col gap-1.5 text-left text-sm">
                {aiWarmup.map((m, i) => (
                  <li
                    key={m.name}
                    className={`flex justify-between gap-2 ${
                      i === currentMove
                        ? "font-bold text-warm-light"
                        : "text-ink/85"
                    }`}
                  >
                    <span>
                      {m.name}
                      {i === currentMove ? " — en cours" : ""}
                    </span>
                    <span className="shrink-0 font-mono">{m.seconds} s</span>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex justify-center gap-2.5">
              <button onClick={onExtend} className={btn("outline", "lg")}>
                +30 s
              </button>
              <button onClick={onFinish} className={btn("warm", "lg")}>
                Terminer
              </button>
            </div>
          </div>
        )}
        {nextUp && <NextUpCard nextUp={nextUp} />}
      </div>
    </main>
  );
}
