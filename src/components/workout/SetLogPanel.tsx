"use client";

import { Mic, Square } from "lucide-react";
import SetRow from "@/components/workout/SetRow";

type SetState = { reps: string; weightKg: string; done: boolean };

export type VoicePanel = {
  listening: boolean;
  message: string | null;
  onTap: () => void;
};

/**
 * Bloc de saisie des séries d'un exercice : une rangée par série + dictée.
 * Utilisé en vue exercice ET pendant le repos — c'est là qu'on a le temps de
 * saisir la série qu'on vient de faire (ou d'en corriger une autre).
 */
export default function SetLogPanel({
  setCount,
  stateAt,
  prevAt,
  currentSetIdx,
  justDoneIdx = null,
  duration,
  timerSetIndex,
  timerLeft,
  voice = null,
  compact = false,
  disableTimer = false,
  onToggle,
  onWeightChange,
  onRepsChange,
  onBlurSave,
  onStartTimer,
  onStopTimer,
}: {
  setCount: number;
  stateAt: (index: number) => SetState;
  prevAt: (index: number) => { reps: number | null; weightKg: number | null } | undefined;
  currentSetIdx: number;
  /** Série tout juste validée, mise en avant pendant le repos. */
  justDoneIdx?: number | null;
  duration: number | null;
  timerSetIndex: number | null;
  timerLeft: number | null;
  /** null = dictée désactivée dans les réglages. */
  voice?: VoicePanel | null;
  /** Version resserrée (écran de repos, où la place manque). */
  compact?: boolean;
  /** Interdit de lancer un chrono de série (pendant le repos). */
  disableTimer?: boolean;
  onToggle: (index: number) => void;
  onWeightChange: (index: number, value: string) => void;
  onRepsChange: (index: number, value: string) => void;
  onBlurSave: (index: number) => void;
  onStartTimer: (index: number) => void;
  onStopTimer: () => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <section className="flex flex-col gap-2">
        {Array.from({ length: setCount }, (_, i) => {
          const state = stateAt(i);
          return (
            <SetRow
              key={i}
              index={i}
              state={state}
              prev={prevAt(i)}
              isCurrent={i === currentSetIdx && !state.done}
              justDone={i === justDoneIdx}
              duration={duration}
              timerLeft={timerSetIndex === i ? timerLeft : null}
              timerBusy={disableTimer || timerSetIndex !== null}
              onToggle={() => onToggle(i)}
              onWeightChange={(v) => onWeightChange(i, v)}
              onRepsChange={(v) => onRepsChange(i, v)}
              onBlurSave={() => onBlurSave(i)}
              onStartTimer={() => onStartTimer(i)}
              onStopTimer={onStopTimer}
            />
          );
        })}
      </section>

      {voice && (
        <div className="flex flex-col items-center gap-2 py-1">
          <button
            onClick={voice.onTap}
            className={`flex items-center justify-center rounded-full border-2 ${
              compact ? "h-14 w-14" : "h-[72px] w-[72px]"
            } ${
              voice.listening
                ? "recording border-accent bg-accent/20"
                : "border-accent/50 bg-accent/10"
            }`}
            aria-label={
              voice.listening ? "Terminer la dictée" : "Dicter poids et répétitions"
            }
          >
            {voice.listening ? (
              <Square
                size={compact ? 20 : 26}
                fill="currentColor"
                className="text-accent"
              />
            ) : (
              <Mic size={compact ? 24 : 30} className="text-accent" />
            )}
          </button>
          <p className="text-center text-[13px] text-muted-2">
            {voice.listening
              ? "Je t'écoute… appuie à nouveau pour terminer."
              : "« 62 kilos, 11 répétitions » ou « toutes les séries à 60 kilos : 12, 10, 9, 8 »"}
          </p>
          {voice.message && (
            <p className="text-center text-sm font-semibold text-accent">
              {voice.message}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
