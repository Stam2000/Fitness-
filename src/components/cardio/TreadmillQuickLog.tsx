"use client";

import { useMemo, useState, useTransition } from "react";
import { Footprints, X } from "lucide-react";
import { btn } from "@/components/ui/button";
import { deleteCardioSession, logCardioSession } from "@/app/actions";
import {
  clampSteps,
  estimateCardio,
  estimateSteps,
  formatDistance,
  formatDuration,
} from "@/lib/cardio";
import { formatDayLabel } from "@/lib/meals";

export type CardioEntry = {
  id: string;
  speedKmh: number;
  inclinePct: number;
  minutes: number;
  distanceKm: number;
  calories: number;
  /** Pas lus sur le tapis ; null = non saisis (estimés côté serveur). */
  steps: number | null;
  performedAt: string; // ISO
};

const DURATION_CHIPS = [15, 20, 30, 45, 60];

function NumberField({
  label,
  unit,
  value,
  onChange,
  step = "1",
  inputMode = "decimal",
  placeholder,
}: {
  label: string;
  unit: string;
  value: string;
  onChange: (v: string) => void;
  step?: string;
  inputMode?: "decimal" | "numeric";
  placeholder?: string;
}) {
  return (
    <label className="flex min-w-0 flex-col text-[11px] text-muted">
      {label}
      <span className="relative mt-0.5 block">
        <input
          type="number"
          inputMode={inputMode}
          step={step}
          min="0"
          value={value}
          placeholder={placeholder}
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

/** Champ jour natif (sélecteur du système), plafonné à aujourd'hui. */
function DayField({
  value,
  max,
  onChange,
}: {
  value: string;
  max: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="flex min-w-0 flex-col text-[11px] text-muted">
      Jour
      <input
        type="date"
        value={value}
        max={max}
        // Un effacement ne fait rien : le jour choisi reste en place.
        onChange={(e) => e.target.value && onChange(e.target.value)}
        className="mt-0.5 w-full rounded-full border border-border bg-surface-2 px-3.5 py-2 font-mono text-[13.5px] font-semibold text-ink outline-none scheme-dark focus:border-accent"
      />
    </label>
  );
}

/**
 * Carte d'accueil du tapis de course : vitesse et durée se saisissent en deux
 * frappes, l'estimation de dépense se met à jour à chaque touche. Pendant de
 * MealQuickCapture — l'un compte ce qui entre, l'autre ce qui brûle.
 *
 * Le jour est modifiable (rattrapage d'une marche oubliée) et le nombre de
 * pas se lit sur l'afficheur du tapis : pré-rempli par l'estimation, la
 * saisie de l'utilisateur fait foi.
 */
export default function TreadmillQuickLog({
  todayKey,
  defaultWeightKg,
  recent,
  todayCalories,
  todaySteps,
}: {
  todayKey: string;
  defaultWeightKg: number;
  recent: CardioEntry[];
  todayCalories: number;
  todaySteps: number;
}) {
  const [day, setDay] = useState(todayKey);
  const [speed, setSpeed] = useState("6");
  const [minutes, setMinutes] = useState("30");
  const [incline, setIncline] = useState("0");
  const [weight, setWeight] = useState(String(defaultWeightKg));
  // Vide = pas lus sur le tapis non saisis : l'estimation sera enregistrée.
  const [steps, setSteps] = useState("");
  const [saved, setSaved] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const num = (v: string) => parseFloat(v.replace(",", ".")) || 0;
  const speedKmh = num(speed);
  const min = num(minutes);
  const inclinePct = num(incline);
  const weightKg = num(weight);
  const stepsInput = steps.trim() === "" ? null : clampSteps(num(steps));
  const valid = speedKmh > 0 && min > 0 && weightKg > 0;

  const estimate = useMemo(
    () =>
      valid
        ? estimateCardio({ speedKmh, inclinePct, minutes: min, weightKg })
        : null,
    [valid, speedKmh, inclinePct, min, weightKg]
  );
  const stepsShown = stepsInput ?? (estimate ? estimateSteps(estimate.distanceKm, speedKmh) : null);

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
          steps: stepsInput,
          dayKey: day,
        });
        setSaved(
          `✓ ${formatDayLabel(day, todayKey)} : ${res.calories} kcal · ${
            res.steps > 0 ? `${res.steps.toLocaleString("fr-FR")} pas · ` : ""
          }${formatDistance(res.distanceKm)}`
        );
        setSteps("");
        setDay(todayKey);
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
        {(todayCalories > 0 || todaySteps > 0) && (
          <span className="text-[12px] text-muted-2">
            aujourd&apos;hui{" "}
            <span className="font-mono font-bold text-accent">
              {todayCalories}
            </span>{" "}
            kcal
            {todaySteps > 0 && (
              <>
                {" · "}
                <span className="font-mono font-bold text-accent">
                  {todaySteps.toLocaleString("fr-FR")}
                </span>{" "}
                pas
              </>
            )}
          </span>
        )}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-3">
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
          label="Pas"
          unit="pas"
          value={steps}
          onChange={setSteps}
          inputMode="numeric"
          placeholder={
            estimate && estimateSteps(estimate.distanceKm, speedKmh) > 0
              ? `≈ ${estimateSteps(estimate.distanceKm, speedKmh).toLocaleString("fr-FR")}`
              : undefined
          }
        />
        <NumberField
          label="Mon poids"
          unit="kg"
          value={weight}
          onChange={setWeight}
          step="0.5"
        />
        <DayField value={day} max={todayKey} onChange={setDay} />
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
              ? `${formatDistance(estimate.distanceKm)} · ${formatDuration(min)} · ${estimate.mets.toFixed(1)} MET`
              : "Saisis une vitesse et une durée"}
            {stepsShown != null && stepsShown > 0 && (
              <>
                {" · "}
                {stepsInput != null ? "" : "≈ "}
                {stepsShown.toLocaleString("fr-FR")} pas
              </>
            )}
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
                {entry.steps != null &&
                  ` · ${entry.steps.toLocaleString("fr-FR")} pas`}
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
