"use client";

import { useMemo, useState } from "react";
import type { ActivityStats } from "@/lib/activity";
import StatTile from "@/components/ui/StatTile";

// Couleur de série validée pour surface sombre (contraste ≥ 3:1).
const SERIES = "var(--color-accent-dark)";
const WEEKDAYS = ["L", "M", "M", "J", "V", "S", "D"];
const MONTHS = [
  "janvier",
  "février",
  "mars",
  "avril",
  "mai",
  "juin",
  "juillet",
  "août",
  "septembre",
  "octobre",
  "novembre",
  "décembre",
];

function key(year: number, month: number, day: number) {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function WeeklyChart({
  weeks,
}: {
  weeks: { weekStart: string; count: number }[];
}) {
  const max = Math.max(1, ...weeks.map((w) => w.count));
  const W = 320;
  const H = 78;
  const PAD_BOTTOM = 14;
  const barW = 18;
  const gap = (W - weeks.length * barW) / (weeks.length + 1);
  const innerH = H - PAD_BOTTOM - 12;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full font-mono"
      role="img"
      aria-label={`Séances par semaine sur 12 semaines : ${weeks
        .map((w) => w.count)
        .join(", ")}`}
    >
      {weeks.map((w, i) => {
        const x = gap + i * (barW + gap);
        const h = w.count === 0 ? 2 : Math.max(6, (w.count / max) * innerH);
        const y = H - PAD_BOTTOM - h;
        const isLast = i === weeks.length - 1;
        return (
          <g key={w.weekStart}>
            <rect
              x={x}
              y={y}
              width={barW}
              height={h}
              rx={w.count === 0 ? 1 : 4}
              fill={w.count === 0 ? "var(--color-border)" : SERIES}
              opacity={isLast ? 1 : 0.85}
            />
            {w.count > 0 && (
              <text
                x={x + barW / 2}
                y={y - 3}
                textAnchor="middle"
                fill="var(--color-muted)"
                fontSize="9"
              >
                {w.count}
              </text>
            )}
          </g>
        );
      })}
      <text x={gap} y={H - 3} fill="var(--color-muted)" fontSize="9">
        il y a 12 sem.
      </text>
      <text
        x={W - gap}
        y={H - 3}
        textAnchor="end"
        fill="var(--color-muted)"
        fontSize="9"
      >
        cette sem.
      </text>
    </svg>
  );
}

export default function ActivityCalendar({ stats }: { stats: ActivityStats }) {
  const today = new Date();
  const [view, setView] = useState({
    year: today.getFullYear(),
    month: today.getMonth(),
  });
  const [selected, setSelected] = useState<string | null>(null);

  const byDate = useMemo(
    () => new Map(stats.days.map((d) => [d.date, d])),
    [stats.days]
  );

  const first = new Date(view.year, view.month, 1);
  const daysInMonth = new Date(view.year, view.month + 1, 0).getDate();
  const leading = (first.getDay() + 6) % 7; // lundi en tête
  const cells: (number | null)[] = [
    ...Array.from({ length: leading }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  const monthSessions = Array.from({ length: daysInMonth }, (_, i) =>
    byDate.get(key(view.year, view.month, i + 1))
  ).filter(Boolean).length;

  const selectedDay = selected ? byDate.get(selected) : null;
  const todayKey = key(today.getFullYear(), today.getMonth(), today.getDate());

  function shiftMonth(delta: number) {
    setSelected(null);
    setView((v) => {
      const d = new Date(v.year, v.month + delta, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });
  }

  if (stats.totalSessions === 0) {
    return (
      <div className="card p-6 text-center">
        <p className="text-4xl">🗓️</p>
        <p className="mt-3 text-sm text-muted-2">
          Tes jours d&apos;entraînement apparaîtront ici dès ta première séance
          terminée.
        </p>
      </div>
    );
  }

  const hours = Math.floor(stats.totalMinutes / 60);

  return (
    <div className="flex flex-col gap-4">
      {/* 2 + 3 tuiles sur téléphone, une seule rangée de 5 dès md */}
      <div className="flex flex-col gap-2 md:grid md:grid-cols-5 md:gap-3">
      <div className="flex gap-2 md:contents">
        <StatTile
          className="flex-1"
          value={`${stats.currentStreakWeeks}`}
          label={
            stats.currentStreakWeeks > 1
              ? "semaines d'affilée 🔥"
              : "semaine d'affilée 🔥"
          }
          hint={`record : ${stats.bestStreakWeeks}`}
        />
        <StatTile
          className="flex-1"
          value={`${stats.thisWeekSessions}`}
          label="séances cette semaine"
          hint={
            stats.daysSinceLast === 0
              ? "dernière : aujourd'hui"
              : stats.daysSinceLast === 1
                ? "dernière : hier"
                : stats.daysSinceLast != null
                  ? `dernière : il y a ${stats.daysSinceLast} j`
                  : undefined
          }
        />
      </div>
      <div className="flex gap-2 md:contents">
        <StatTile
          className="flex-1"
          value={`${stats.totalSessions}`}
          label="séances au total"
        />
        <StatTile
          className="flex-1"
          value={hours > 0 ? `${hours} h` : `${stats.totalMinutes} min`}
          label="temps d'entraînement"
        />
        <StatTile
          className="flex-1"
          value={`${Math.round(stats.totalVolume / 1000)} t`}
          label="volume soulevé"
        />
      </div>
      </div>

      <div className="flex flex-col gap-4 lg:grid lg:grid-cols-2 lg:items-start">
      <section className="card p-4">
        <div className="flex items-center justify-between">
          <button
            onClick={() => shiftMonth(-1)}
            aria-label="Mois précédent"
            className="rounded-[10px] border border-border px-3.5 py-1.5 text-sm text-muted-2"
          >
            ‹
          </button>
          <div className="text-center">
            <p className="text-[15px] font-extrabold capitalize">
              {MONTHS[view.month]} {view.year}
            </p>
            <p className="text-xs text-muted-2">
              {monthSessions} jour{monthSessions > 1 ? "s" : ""}{" "}
              d&apos;entraînement
            </p>
          </div>
          <button
            onClick={() => shiftMonth(1)}
            aria-label="Mois suivant"
            className="rounded-[10px] border border-border px-3.5 py-1.5 text-sm text-muted-2"
          >
            ›
          </button>
        </div>

        <div className="mx-auto mt-3 grid max-w-md grid-cols-7 gap-1">
          {WEEKDAYS.map((d, i) => (
            <div
              key={`${d}-${i}`}
              className="pb-1 text-center text-[10.5px] text-muted"
            >
              {d}
            </div>
          ))}
          {cells.map((day, i) => {
            if (day === null)
              return <div key={`empty-${i}`} className="aspect-square" />;
            const k = key(view.year, view.month, day);
            const entry = byDate.get(k);
            const isToday = k === todayKey;
            const isSelected = k === selected;
            return (
              <button
                key={k}
                onClick={() => setSelected(isSelected ? null : entry ? k : null)}
                disabled={!entry}
                aria-label={
                  entry
                    ? `${day} ${MONTHS[view.month]} : ${entry.sessions} séance${entry.sessions > 1 ? "s" : ""}`
                    : `${day} ${MONTHS[view.month]} : repos`
                }
                className={`relative flex aspect-square items-center justify-center rounded-[10px] font-mono text-[13.5px] ${
                  entry
                    ? isSelected
                      ? "bg-accent font-extrabold text-black"
                      : "bg-accent/15 font-bold text-accent"
                    : "text-muted"
                } ${isToday && !isSelected ? "ring-[1.5px] ring-inset ring-ink/50" : ""}`}
              >
                {day}
                {entry && entry.sessions > 1 && (
                  <span className="absolute bottom-0.5 text-[9px] leading-none">
                    ×{entry.sessions}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {selectedDay && (
          <div className="mt-3 rounded-[14px] bg-surface-2 p-3">
            <p className="text-[13.5px] font-bold">
              {Number(selectedDay.date.slice(8))} {MONTHS[view.month]}
            </p>
            {selectedDay.labels.map((label, i) => (
              <p key={`${label}-${i}`} className="mt-1 text-sm text-muted-2">
                • {label}
              </p>
            ))}
            <p className="mt-1.5 font-mono text-xs text-muted-2">
              {selectedDay.minutes} min
              {selectedDay.volume > 0 &&
                ` · ${Math.round(selectedDay.volume).toLocaleString("fr-FR")} kg de volume`}
            </p>
          </div>
        )}
      </section>

      <div className="flex flex-col gap-4">
      <section className="card p-4">
        <h2 className="text-sm font-extrabold">Séances par semaine</h2>
        <p className="text-xs text-muted">12 dernières semaines</p>
        <div className="mt-2 max-w-xl">
          <WeeklyChart weeks={stats.weeklyCounts} />
        </div>
      </section>

      {stats.focusBreakdown.length > 0 && (
        <section className="card p-4">
          <h2 className="text-sm font-extrabold">Répartition des séances</h2>
          <div className="mt-2 flex flex-col gap-2">
            {stats.focusBreakdown.slice(0, 8).map((f) => (
              <div key={f.label}>
                <div className="flex justify-between gap-2 text-xs">
                  <span className="min-w-0 truncate">{f.label}</span>
                  <span className="shrink-0 text-muted">
                    {f.count} séance{f.count > 1 ? "s" : ""}
                  </span>
                </div>
                <div className="mt-1 h-2 overflow-hidden rounded-full bg-surface-2">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${(f.count / stats.focusBreakdown[0].count) * 100}%`,
                      background: SERIES,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
      </div>
      </div>
    </div>
  );
}
