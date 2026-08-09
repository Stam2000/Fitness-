"use client";

import { useState } from "react";
import type { ExerciseProgress } from "@/lib/progress";

const SERIES = "#65a30d"; // validé pour surface sombre (contraste ≥ 3:1)

function formatDate(iso: string) {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "short",
  }).format(new Date(iso));
}

function Chart({ exercise }: { exercise: ExerciseProgress }) {
  const values = exercise.points.map((p) =>
    exercise.metric === "weight" ? (p.topWeight ?? 0) : (p.topReps ?? 0)
  );
  const [active, setActive] = useState(values.length - 1);

  const W = 320;
  const H = 110;
  const PAD_X = 10;
  const PAD_TOP = 24;
  const PAD_BOTTOM = 18;

  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const innerW = W - PAD_X * 2;
  const innerH = H - PAD_TOP - PAD_BOTTOM;
  const x = (i: number) =>
    values.length === 1
      ? W / 2
      : PAD_X + (i / (values.length - 1)) * innerW;
  const y = (v: number) => PAD_TOP + innerH - ((v - min) / span) * innerH;

  const prValue = Math.max(...values);
  const prIndex = values.indexOf(prValue);
  const unit = exercise.metric === "weight" ? "kg" : "reps";
  const path = values
    .map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`)
    .join(" ");

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full"
      role="img"
      aria-label={`Progression ${exercise.name} : ${values.join(", ")} ${unit}`}
    >
      {/* grille discrète : min et max */}
      {[min, max].map((v) => (
        <g key={v}>
          <line
            x1={PAD_X}
            x2={W - PAD_X}
            y1={y(v)}
            y2={y(v)}
            stroke="#2a3441"
            strokeWidth="1"
          />
          <text
            x={PAD_X}
            y={y(v) - 3}
            fill="#8b98a5"
            fontSize="9"
          >
            {v} {unit}
          </text>
        </g>
      ))}

      {values.length > 1 && (
        <path d={path} fill="none" stroke={SERIES} strokeWidth="2" />
      )}

      {values.map((v, i) => (
        <g key={i}>
          {/* cible tactile large, marque fine */}
          <circle
            cx={x(i)}
            cy={y(v)}
            r="14"
            fill="transparent"
            onClick={() => setActive(i)}
          />
          <circle
            cx={x(i)}
            cy={y(v)}
            r={i === active ? 5 : 4}
            fill={SERIES}
            stroke="#141a22"
            strokeWidth="2"
            pointerEvents="none"
          />
          {i === prIndex && (
            <circle
              cx={x(i)}
              cy={y(v)}
              r="8"
              fill="none"
              stroke="#e7edf3"
              strokeWidth="1"
              pointerEvents="none"
            />
          )}
        </g>
      ))}

      {/* étiquette du point actif */}
      {active >= 0 && active < values.length && (
        <text
          x={Math.min(Math.max(x(active), 28), W - 28)}
          y={y(values[active]) - 10}
          textAnchor="middle"
          fill="#e7edf3"
          fontSize="11"
          fontWeight="600"
        >
          {values[active]} {unit}
          {active === prIndex ? " ★" : ""}
        </text>
      )}

      {/* dates premier / actif / dernier */}
      <text x={PAD_X} y={H - 4} fill="#8b98a5" fontSize="9">
        {formatDate(exercise.points[0].date)}
      </text>
      {values.length > 1 && (
        <text
          x={W - PAD_X}
          y={H - 4}
          textAnchor="end"
          fill="#8b98a5"
          fontSize="9"
        >
          {formatDate(exercise.points[exercise.points.length - 1].date)}
        </text>
      )}
    </svg>
  );
}

export default function ProgressCharts({
  exercises,
}: {
  exercises: ExerciseProgress[];
}) {
  if (exercises.length === 0) {
    return (
      <div className="rounded-2xl border border-border bg-surface p-6 text-center">
        <p className="text-4xl">📈</p>
        <p className="mt-3 text-sm text-muted">
          Termine quelques séances pour voir ta progression exercice par
          exercice.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {exercises.map((ex) => {
        const last = ex.points[ex.points.length - 1];
        return (
          <section
            key={ex.name}
            className="rounded-2xl border border-border bg-surface p-4"
          >
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="min-w-0 truncate font-semibold">{ex.name}</h2>
              <span className="shrink-0 text-xs text-muted">
                {ex.points.length} séance{ex.points.length > 1 ? "s" : ""}
              </span>
            </div>
            <div className="mt-2 flex gap-3 text-sm">
              <div>
                <p className="text-xs text-muted">Record ★</p>
                <p className="font-semibold text-accent">
                  {ex.metric === "weight"
                    ? `${ex.prWeight} kg`
                    : `${ex.prReps} reps`}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted">Dernière fois</p>
                <p className="font-semibold">
                  {ex.metric === "weight"
                    ? `${last.topWeight} kg × ${last.topReps ?? "—"}`
                    : `${last.topReps} reps`}
                </p>
              </div>
              {last.volume > 0 && (
                <div>
                  <p className="text-xs text-muted">Volume</p>
                  <p className="font-semibold">{Math.round(last.volume)} kg</p>
                </div>
              )}
            </div>
            <div className="mt-2">
              <Chart exercise={ex} />
            </div>
          </section>
        );
      })}
    </div>
  );
}
