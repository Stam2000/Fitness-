"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

// Variante d'un exercice (mêmes muscles), jouée en alternance selon les
// passages. Non éditable ici : simple passthrough conservé à l'enregistrement.
export type EditableVariation = {
  name: string;
  sets: number;
  reps: string;
  restSeconds: number;
  weightHint?: string | null;
  equipment: string[];
  muscles?: string[];
  targetSeconds?: number | null;
  notes?: string | null;
};

export type EditableExercise = {
  id?: string;
  name: string;
  sets: number;
  reps: string;
  restSeconds: number;
  weightHint?: string | null;
  equipment: string[];
  muscles?: string[];
  targetSeconds?: number | null;
  transitionSeconds?: number | null;
  notes?: string | null;
  imageUrl?: string | null;
  variations?: EditableVariation[];
};

export type EditableDay = {
  id?: string;
  name: string;
  focus?: string | null;
  exercises: EditableExercise[];
};

export type EditableProgram = {
  name: string;
  description?: string | null;
  // Durée du bloc en cycles, décidée par l'IA. Non éditable ici : passthrough.
  blockCycles?: number | null;
  days: EditableDay[];
};

const EMPTY_EXERCISE: EditableExercise = {
  name: "",
  sets: 3,
  reps: "10",
  restSeconds: 90,
  weightHint: null,
  equipment: [],
  notes: null,
};

export default function ProgramEditor({
  initial,
  onSave,
  saveLabel,
  saving,
}: {
  initial: EditableProgram;
  onSave: (program: EditableProgram) => void;
  saveLabel: string;
  saving: boolean;
}) {
  const [program, setProgram] = useState<EditableProgram>(initial);
  const [openDay, setOpenDay] = useState(0);

  function patchDay(di: number, patch: Partial<EditableDay>) {
    setProgram((p) => ({
      ...p,
      days: p.days.map((d, i) => (i === di ? { ...d, ...patch } : d)),
    }));
  }

  function patchExercise(
    di: number,
    ei: number,
    patch: Partial<EditableExercise>
  ) {
    setProgram((p) => ({
      ...p,
      days: p.days.map((d, i) =>
        i === di
          ? {
              ...d,
              exercises: d.exercises.map((ex, j) =>
                j === ei ? { ...ex, ...patch } : ex
              ),
            }
          : d
      ),
    }));
  }

  function moveExercise(di: number, ei: number, dir: -1 | 1) {
    setProgram((p) => {
      const exercises = [...p.days[di].exercises];
      const target = ei + dir;
      if (target < 0 || target >= exercises.length) return p;
      [exercises[ei], exercises[target]] = [exercises[target], exercises[ei]];
      return {
        ...p,
        days: p.days.map((d, i) => (i === di ? { ...d, exercises } : d)),
      };
    });
  }

  function removeExercise(di: number, ei: number) {
    setProgram((p) => ({
      ...p,
      days: p.days.map((d, i) =>
        i === di
          ? { ...d, exercises: d.exercises.filter((_, j) => j !== ei) }
          : d
      ),
    }));
  }

  function addExercise(di: number) {
    setProgram((p) => ({
      ...p,
      days: p.days.map((d, i) =>
        i === di
          ? { ...d, exercises: [...d.exercises, { ...EMPTY_EXERCISE }] }
          : d
      ),
    }));
  }

  function addDay() {
    setProgram((p) => ({
      ...p,
      days: [
        ...p.days,
        {
          name: `Jour ${p.days.length + 1}`,
          focus: null,
          exercises: [{ ...EMPTY_EXERCISE }],
        },
      ],
    }));
    setOpenDay(program.days.length);
  }

  function removeDay(di: number) {
    setProgram((p) => ({ ...p, days: p.days.filter((_, i) => i !== di) }));
    setOpenDay((d) => Math.max(0, d - (di <= d ? 1 : 0)));
  }

  const valid =
    program.name.trim() &&
    program.days.length > 0 &&
    program.days.every(
      (d) =>
        d.name.trim() &&
        d.exercises.length > 0 &&
        d.exercises.every((ex) => ex.name.trim())
    );

  return (
    <div className="flex flex-col gap-4">
      <div className="card p-3.5">
        <label className="overline-label">Nom du programme</label>
        <input
          value={program.name}
          onChange={(e) => setProgram((p) => ({ ...p, name: e.target.value }))}
          className="mt-1.5 w-full rounded-full border-[1.5px] border-border bg-surface-2 px-4 py-2.5 font-semibold outline-none focus:border-accent"
        />
        <textarea
          value={program.description ?? ""}
          onChange={(e) =>
            setProgram((p) => ({ ...p, description: e.target.value }))
          }
          placeholder="Description (optionnelle)"
          rows={2}
          className="mt-2 w-full rounded-[18px] border-[1.5px] border-border bg-surface-2 px-4 py-2.5 text-sm outline-none focus:border-accent"
        />
      </div>

      {program.days.map((day, di) => (
        <div key={day.id ?? `new-${di}`} className="card">
          <button
            onClick={() => setOpenDay(openDay === di ? -1 : di)}
            className="flex w-full items-center gap-3 p-3.5 text-left"
          >
            <span
              className={`font-mono text-[22px] font-extrabold ${
                openDay === di ? "text-accent" : "text-muted/60"
              }`}
            >
              {String(di + 1).padStart(2, "0")}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[15.5px] font-extrabold">{day.name}</p>
              <p className="text-[12.5px] text-muted-2">
                {day.focus ? `${day.focus} · ` : ""}
                {day.exercises.length} exercice
                {day.exercises.length > 1 ? "s" : ""}
              </p>
            </div>
            <span className={openDay === di ? "text-accent" : "text-muted-2"}>
              {openDay === di ? "▾" : "▸"}
            </span>
          </button>

          {openDay === di && (
            <div className="flex flex-col gap-3 border-t border-card-border p-3">
              <div className="flex gap-2">
                <input
                  value={day.name}
                  onChange={(e) => patchDay(di, { name: e.target.value })}
                  placeholder="Nom du jour"
                  className="min-w-0 flex-1 rounded-full border-[1.5px] border-border bg-surface-2 px-4 py-2 text-sm outline-none focus:border-accent"
                />
                <input
                  value={day.focus ?? ""}
                  onChange={(e) => patchDay(di, { focus: e.target.value })}
                  placeholder="Focus"
                  className="w-28 rounded-full border-[1.5px] border-border bg-surface-2 px-4 py-2 text-sm outline-none focus:border-accent"
                />
              </div>

              {day.exercises.map((ex, ei) => (
                <div
                  key={ex.id ?? `new-${ei}`}
                  className="rounded-xl border border-border bg-surface-2 p-3"
                >
                  <div className="flex items-start gap-2">
                    <input
                      value={ex.name}
                      onChange={(e) =>
                        patchExercise(di, ei, { name: e.target.value })
                      }
                      placeholder="Nom de l'exercice"
                      className="min-w-0 flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm font-medium outline-none focus:border-accent"
                    />
                    <div className="flex shrink-0 gap-1">
                      <button
                        onClick={() => moveExercise(di, ei, -1)}
                        disabled={ei === 0}
                        className="rounded-lg border border-border px-2 py-1.5 text-xs disabled:opacity-30"
                        aria-label="Monter"
                      >
                        ↑
                      </button>
                      <button
                        onClick={() => moveExercise(di, ei, 1)}
                        disabled={ei === day.exercises.length - 1}
                        className="rounded-lg border border-border px-2 py-1.5 text-xs disabled:opacity-30"
                        aria-label="Descendre"
                      >
                        ↓
                      </button>
                      <button
                        onClick={() => removeExercise(di, ei)}
                        className="rounded-lg border border-border px-2 py-1.5 text-xs text-danger"
                        aria-label="Supprimer"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                  <div className="mt-2 grid grid-cols-3 gap-2">
                    <label className="text-xs text-muted">
                      Séries
                      <input
                        type="number"
                        value={ex.sets}
                        min={1}
                        onChange={(e) =>
                          patchExercise(di, ei, {
                            sets: Math.max(1, Number(e.target.value) || 1),
                          })
                        }
                        className="mt-0.5 w-full rounded-lg border border-border bg-surface px-2 py-2 text-sm text-ink outline-none focus:border-accent"
                      />
                    </label>
                    <label className="text-xs text-muted">
                      Reps
                      <input
                        value={ex.reps}
                        onChange={(e) =>
                          patchExercise(di, ei, { reps: e.target.value })
                        }
                        className="mt-0.5 w-full rounded-lg border border-border bg-surface px-2 py-2 text-sm text-ink outline-none focus:border-accent"
                      />
                    </label>
                    <label className="text-xs text-muted">
                      Repos (s)
                      <input
                        type="number"
                        value={ex.restSeconds}
                        min={0}
                        step={15}
                        onChange={(e) =>
                          patchExercise(di, ei, {
                            restSeconds: Math.max(
                              0,
                              Number(e.target.value) || 0
                            ),
                          })
                        }
                        className="mt-0.5 w-full rounded-lg border border-border bg-surface px-2 py-2 text-sm text-ink outline-none focus:border-accent"
                      />
                    </label>
                  </div>
                  <input
                    value={ex.weightHint ?? ""}
                    onChange={(e) =>
                      patchExercise(di, ei, { weightHint: e.target.value })
                    }
                    placeholder="Charge conseillée (ex. 60% 1RM, modéré…)"
                    className="mt-2 w-full rounded-lg border border-border bg-surface px-3 py-2 text-xs outline-none focus:border-accent"
                  />
                  {(ex.notes || ex.equipment.length > 0) && (
                    <p className="mt-2 text-xs text-muted">
                      {ex.equipment.length > 0 && (
                        <>🏋️ {ex.equipment.join(", ")} · </>
                      )}
                      {ex.notes}
                    </p>
                  )}
                  {(ex.variations?.length ?? 0) > 0 && (
                    <div className="mt-2 flex flex-col gap-0.5">
                      {ex.variations!.map((v, vi) => (
                        <p key={vi} className="text-xs text-muted">
                          🔁 Variante : {v.name} — {v.sets} × {v.reps}
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              ))}

              <div className="flex gap-2">
                <button
                  onClick={() => addExercise(di)}
                  className="min-h-[44px] flex-1 rounded-full border-[1.5px] border-dashed border-border text-sm font-semibold text-muted-2"
                >
                  + Exercice
                </button>
                {program.days.length > 1 && (
                  <button
                    onClick={() => removeDay(di)}
                    className="min-h-[44px] rounded-full border-[1.5px] border-border px-4 text-sm font-semibold text-danger"
                  >
                    Supprimer le jour
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      ))}

      <button
        onClick={addDay}
        className="min-h-[48px] rounded-full border-[1.5px] border-dashed border-border text-sm font-semibold text-muted-2"
      >
        + Ajouter un jour
      </button>

      <Button
        onClick={() => onSave(program)}
        disabled={!valid || saving}
        variant="primary"
        size="lg"
      >
        {saving ? "Enregistrement…" : saveLabel}
      </Button>
    </div>
  );
}
