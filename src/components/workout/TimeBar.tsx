"use client";

function fmt(totalSeconds: number) {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
    : `${m}:${String(s).padStart(2, "0")}`;
}

/**
 * Barre de temps de la vue exercice : temps de séance total à gauche,
 * compte à rebours (temps cible IA de la série en cours) en pastille
 * lime à droite — négatif quand le temps cible est dépassé — avec pause.
 */
export default function TimeBar({
  sessionSeconds,
  label,
  remainingSeconds,
  paused,
  onTogglePause,
}: {
  sessionSeconds: number | null;
  /** Libellé de la pastille, ex. « Série 2/4 ». */
  label: string;
  remainingSeconds: number;
  paused: boolean;
  onTogglePause: () => void;
}) {
  const overdue = remainingSeconds < 0;
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="overline-label">⏱ Temps de séance</p>
        <p className="font-mono text-[28px] font-black leading-tight tabular-nums">
          {sessionSeconds != null ? fmt(sessionSeconds) : "—:—"}
        </p>
      </div>
      <div
        className={`flex shrink-0 items-center gap-2.5 rounded-2xl px-3.5 py-2 text-black ${
          overdue ? "bg-warm" : "bg-accent"
        }`}
      >
        <div className="text-right">
          <p className="text-[10px] font-extrabold uppercase tracking-[0.1em]">
            {label}
          </p>
          <p className="font-mono text-[22px] font-black leading-tight tabular-nums">
            {overdue ? "-" : ""}
            {fmt(Math.abs(remainingSeconds))}
          </p>
        </div>
        <button
          onClick={onTogglePause}
          aria-label={
            paused ? "Reprendre le chrono" : "Mettre le chrono en pause"
          }
          className="flex h-9 w-9 items-center justify-center rounded-full bg-black/15 text-[13px] font-black"
        >
          {paused ? "▶" : "❚❚"}
        </button>
      </div>
    </div>
  );
}
