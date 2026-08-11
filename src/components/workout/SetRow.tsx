"use client";

import { Check, Play, Square } from "lucide-react";

type SetState = { reps: string; weightKg: string; done: boolean };

/**
 * Rangée d'une série : pastille 44px (✓ / numéro), saisie poids et
 * reps — ou chrono intégré pour les exercices « en secondes ».
 */
export default function SetRow({
  index,
  state,
  prev,
  isCurrent,
  justDone = false,
  duration,
  timerLeft,
  timerBusy,
  onToggle,
  onWeightChange,
  onRepsChange,
  onBlurSave,
  onStartTimer,
  onStopTimer,
}: {
  index: number;
  state: SetState;
  prev: { reps: number | null; weightKg: number | null } | undefined;
  isCurrent: boolean;
  /** Série qui vient d'être validée : mise en avant pendant le repos. */
  justDone?: boolean;
  duration: number | null;
  timerLeft: number | null;
  timerBusy: boolean;
  onToggle: () => void;
  onWeightChange: (value: string) => void;
  onRepsChange: (value: string) => void;
  onBlurSave: () => void;
  onStartTimer: () => void;
  onStopTimer: () => void;
}) {
  const rowClass = justDone
    ? "border-[1.5px] border-accent bg-accent/10 ring-2 ring-accent/30"
    : state.done
      ? "border-[1.5px] border-accent/45 bg-accent/10"
      : isCurrent
        ? "border-[1.5px] border-accent bg-surface"
        : "border border-card-border bg-surface opacity-60";
  return (
    <div className={`flex items-center gap-2.5 rounded-[14px] p-2.5 ${rowClass}`}>
      <button
        onClick={onToggle}
        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-lg font-extrabold ${
          state.done
            ? "bg-accent text-black"
            : isCurrent
              ? "border-2 border-accent text-accent"
              : "border-2 border-border text-muted-2"
        }`}
        aria-label={`Série ${index + 1} ${state.done ? "faite" : "à faire"}`}
      >
        {state.done ? <Check size={20} strokeWidth={3} /> : index + 1}
      </button>
      <label className="flex min-w-0 flex-1 flex-col text-xs text-muted">
        Poids (kg)
        <input
          type="number"
          inputMode="decimal"
          value={state.weightKg}
          placeholder={prev?.weightKg != null ? String(prev.weightKg) : "—"}
          onChange={(e) => onWeightChange(e.target.value)}
          onBlur={onBlurSave}
          className="mt-0.5 w-full rounded-full border border-border bg-surface-2 px-3 py-2.5 font-mono text-base font-semibold text-ink outline-none focus:border-accent"
        />
      </label>
      {duration !== null ? (
        <div className="flex min-w-0 flex-1 flex-col text-xs text-muted">
          Durée
          {timerLeft !== null ? (
            <button
              onClick={onStopTimer}
              aria-label="Arrêter le chrono"
              className="mt-0.5 inline-flex w-full items-center justify-center gap-2 rounded-full border border-accent bg-accent/15 px-3 py-2.5 font-mono text-base font-bold tabular-nums text-accent"
            >
              {Math.floor(timerLeft / 60)}:
              {String(timerLeft % 60).padStart(2, "0")}
              <Square size={13} fill="currentColor" />
            </button>
          ) : state.done ? (
            <p className="mt-0.5 inline-flex w-full items-center justify-center gap-1.5 rounded-full border border-border bg-surface-2 px-3 py-2.5 font-mono text-base text-ink">
              {state.reps || duration} s
              <Check size={14} strokeWidth={3} className="text-accent" />
            </p>
          ) : (
            <button
              onClick={onStartTimer}
              disabled={timerBusy}
              aria-label={`Lancer le chrono de ${duration} s`}
              className="mt-0.5 inline-flex w-full items-center justify-center gap-2 rounded-full border border-accent/50 bg-accent/10 px-3 py-2.5 font-mono text-base font-semibold text-accent disabled:opacity-40"
            >
              <Play size={13} fill="currentColor" /> {duration} s
            </button>
          )}
        </div>
      ) : (
        <label className="flex min-w-0 flex-1 flex-col text-xs text-muted">
          Reps
          <input
            type="number"
            inputMode="numeric"
            value={state.reps}
            placeholder={prev?.reps != null ? String(prev.reps) : "—"}
            onChange={(e) => onRepsChange(e.target.value)}
            onBlur={onBlurSave}
            className="mt-0.5 w-full rounded-full border border-border bg-surface-2 px-3 py-2.5 font-mono text-base font-semibold text-ink outline-none focus:border-accent"
          />
        </label>
      )}
      {justDone ? (
        <span className="shrink-0 text-[11px] font-extrabold text-accent">
          à l&apos;instant
        </span>
      ) : (
        <span className="hidden shrink-0 text-[11px] text-muted sm:block">
          série {index + 1}
        </span>
      )}
    </div>
  );
}
