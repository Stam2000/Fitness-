"use client";

import { useMemo, useState, useTransition } from "react";
import { Footprints, X } from "lucide-react";
import { btn } from "@/components/ui/button";
import { deleteCardioSession, logCardioSession } from "@/app/actions";
import { estimateCardio, formatDistance, formatDuration } from "@/lib/cardio";

export type CardioEntry = {
  id: string;
  speedKmh: number;
  inclinePct: number;
  minutes: number;
  distanceKm: number;
  calories: number;
  performedAt: string; // ISO
};

const DURATION_CHIPS = [15, 20, 30, 45, 60];

function NumberField({
  label,
  unit,
  value,
  onChange,
  step = "1",
}: {
  label: string;
  unit: string;
  value: string;
  onChange: (v: string) => void;
  step?: string;
}) {
  return (
    <label className="flex min-w-0 flex-col text-[11px] text-muted">
      {label}
      <span className="relative mt-0.5 block">
        <input
          type="number"
          inputMode="decimal"
          step={step}
          min="0"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded-full border border-border bg-surface-2 px-3.5 py-2.5 pr-10 font-mono text-[15px] font-semibold text-ink outline-none focus:border-accent"
        />
        <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-[11px] text-muted-2">
          {unit}
        </span>
      </span>
    </label>
  );
}

/**
 * Carte d'accueil du tapis de course : vitesse et durée se saisissent en deux
 * frappes, l'estimation de dépense se met à jour à chaque touche. Pendant de
 * MealQuickCapture — l'un compte ce qui entre, l'autre ce qui brûle.
 */
export default function TreadmillQuickLog({
  defaultWeightKg,
  recent,
  todayCalories,
}: {
  defaultWeightKg: number;
  recent: CardioEntry[];
  todayCalories: number;
}) {
  const [speed, setSpeed] = useState("6");
  const [minutes, setMinutes] = useState("30");
  const [incline, setIncline] = useState("0");
  const [weight, setWeight] = useState(String(defaultWeightKg));
  const [saved, setSaved] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const num = (v: string) => parseFloat(v.replace(",", ".")) || 0;
  const speedKmh = num(speed);
  const min = num(minutes);
  const inclinePct = num(incline);
  const weightKg = num(weight);
  const valid = speedKmh > 0 && min > 0 && weightKg > 0;

  const estimate = useMemo(
    () =>
      valid
        ? estimateCardio({ speedKmh, inclinePct, minutes: min, weightKg })
        : null,
    [valid, speedKmh, inclinePct, min, weightKg]
  );

  function save() {
    if (!valid) return;
    setError(null);
    startTransition(async () => {
      try {
        const res = await logCardioSession({
          speedKmh,
          inclinePct,
          minutes: min,
          weightKg,
        });
        setSaved(
          `✓ ${res.calories} kcal enregistrées (${formatDistance(res.distanceKm)})`
        );
        setTimeout(() => setSaved(null), 6000);
      } catch {
        setError("Enregistrement impossible. Réessaie.");
      }
    });
  }

  return (
    <section className="card p-4">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="overline-label flex items-center gap-1.5">
          <Footprints size={13} className="text-accent" /> Tapis de course
        </h2>
        {todayCalories > 0 && (
          <span className="text-[12px] text-muted-2">
            aujourd&apos;hui{" "}
            <span className="font-mono font-bold text-accent">
              {todayCalories}
            </span>{" "}
            kcal
          </span>
        )}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-4">
        <NumberField
          label="Vitesse"
          unit="km/h"
          value={speed}
          onChange={setSpeed}
          step="0.1"
        />
        <NumberField
          label="Durée"
          unit="min"
          value={minutes}
          onChange={setMinutes}
        />
        <NumberField
          label="Pente"
          unit="%"
          value={incline}
          onChange={setIncline}
          step="0.5"
        />
        <NumberField
          label="Mon poids"
          unit="kg"
          value={weight}
          onChange={setWeight}
          step="0.5"
        />
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5">
        {DURATION_CHIPS.map((d) => (
          <button
            key={d}
            onClick={() => setMinutes(String(d))}
            className={`rounded-full border px-3 py-1.5 text-[12px] ${
              minutes === String(d)
                ? "border-accent bg-accent/15 text-accent"
                : "border-border text-muted-2"
            }`}
          >
            {d} min
          </button>
        ))}
      </div>

      <div className="mt-3 flex flex-col gap-3 md:flex-row md:items-center">
        <div className="flex-1 rounded-[18px] bg-surface-2 px-3 py-3 text-center">
          <p className="font-mono text-[26px] font-bold leading-none text-accent">
            {estimate ? `≈ ${estimate.calories}` : "—"}
            <span className="text-[13px] font-medium text-muted-2"> kcal</span>
          </p>
          <p className="mt-1.5 text-[12px] text-muted-2">
            {estimate
              ? `${formatDistance(estimate.distanceKm)} · ${formatDuration(min)} · ${estimate.mets.toFixed(1)} MET · ${estimate.kcalPerMin.toFixed(1)} kcal/min`
              : "Saisis une vitesse et une durée"}
          </p>
        </div>
        <button
          onClick={save}
          disabled={!valid || pending}
          className={btn("primary", "lg", "w-full md:w-auto")}
        >
          {pending ? "Enregistrement…" : "Enregistrer"}
        </button>
      </div>

      {saved && (
        <p className="mt-2 text-center text-[13px] text-accent">{saved}</p>
      )}
      {error && (
        <p className="mt-2 text-center text-[13px] text-danger">{error}</p>
      )}

      {recent.length > 0 && (
        <div className="mt-3 flex flex-col gap-1.5 border-t border-card-border pt-3">
          {recent.map((entry) => (
            <div
              key={entry.id}
              className="flex items-center justify-between gap-2 text-[12.5px]"
            >
              <span className="min-w-0 truncate text-muted-2">
                {new Intl.DateTimeFormat("fr-FR", {
                  day: "numeric",
                  month: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                }).format(new Date(entry.performedAt))}{" "}
                · {entry.speedKmh} km/h
                {entry.inclinePct > 0 ? ` · ${entry.inclinePct} %` : ""} ·{" "}
                {formatDuration(entry.minutes)}
              </span>
              <span className="flex shrink-0 items-center gap-2">
                <span className="font-mono font-bold text-accent">
                  {entry.calories} kcal
                </span>
                <button
                  onClick={() =>
                    startTransition(() => deleteCardioSession(entry.id))
                  }
                  aria-label="Supprimer cette séance"
                  className="text-muted-2"
                >
                  <X size={14} />
                </button>
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
