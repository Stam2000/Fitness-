"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, PencilLine, Plus, Trash2, X } from "lucide-react";
import BottomSheet from "@/components/ui/BottomSheet";
import { btn } from "@/components/ui/button";
import IconButton from "@/components/ui/IconButton";

export type EditableSet = {
  setIndex: number;
  reps: number | null;
  weightKg: number | null;
  done: boolean;
  variationName: string | null;
};

export type EditableExercise = {
  id: string;
  name: string;
  sets: EditableSet[];
};

type Row = {
  setIndex: number;
  reps: string;
  weightKg: string;
  done: boolean;
  variationName: string | null;
};

function toRow(set: EditableSet): Row {
  return {
    setIndex: set.setIndex,
    reps: set.reps != null ? String(set.reps) : "",
    weightKg: set.weightKg != null ? String(set.weightKg) : "",
    done: set.done,
    variationName: set.variationName,
  };
}

/**
 * Correction d'une séance terminée : reprendre une charge mal saisie, un
 * nombre de répétitions, ajouter une série oubliée ou en supprimer une.
 */
export default function SessionLogEditor({
  sessionId,
  label,
  exercises,
}: {
  sessionId: string;
  label: string;
  exercises: EditableExercise[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<Record<string, Row[]>>(() =>
    Object.fromEntries(exercises.map((ex) => [ex.id, ex.sets.map(toRow)]))
  );
  // Séries retirées de l'écran : supprimées en base à l'enregistrement.
  const [removed, setRemoved] = useState<{ exerciseId: string; setIndex: number }[]>(
    []
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setRows(
      Object.fromEntries(exercises.map((ex) => [ex.id, ex.sets.map(toRow)]))
    );
    setRemoved([]);
    setError(null);
  }

  function close() {
    setOpen(false);
    reset();
  }

  function patchRow(exerciseId: string, setIndex: number, patch: Partial<Row>) {
    setRows((prev) => ({
      ...prev,
      [exerciseId]: prev[exerciseId].map((r) =>
        r.setIndex === setIndex ? { ...r, ...patch } : r
      ),
    }));
  }

  function removeRow(exerciseId: string, setIndex: number) {
    setRows((prev) => ({
      ...prev,
      [exerciseId]: prev[exerciseId].filter((r) => r.setIndex !== setIndex),
    }));
    setRemoved((prev) => [...prev, { exerciseId, setIndex }]);
  }

  function addRow(exerciseId: string) {
    setRows((prev) => {
      const current = prev[exerciseId];
      const nextIndex =
        current.length > 0
          ? Math.max(...current.map((r) => r.setIndex)) + 1
          : 0;
      // Une série ré-ajoutée après suppression reprend sa place.
      setRemoved((r) =>
        r.filter(
          (d) => !(d.exerciseId === exerciseId && d.setIndex === nextIndex)
        )
      );
      return {
        ...prev,
        [exerciseId]: [
          ...current,
          {
            setIndex: nextIndex,
            reps: "",
            weightKg: "",
            done: true,
            variationName: current[current.length - 1]?.variationName ?? null,
          },
        ],
      };
    });
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      for (const { exerciseId, setIndex } of removed) {
        const res = await fetch(`/api/sessions/${sessionId}/logs`, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ exerciseId, setIndex }),
        });
        if (!res.ok) throw new Error("delete");
      }
      for (const exercise of exercises) {
        for (const row of rows[exercise.id]) {
          // Les séries inchangées ne sont pas réécrites : une série prescrite
          // jamais saisie reste absente de la base plutôt que d'y créer une
          // ligne vide.
          const initial = exercise.sets.find(
            (s) => s.setIndex === row.setIndex
          );
          const before = initial ? toRow(initial) : null;
          if (
            before &&
            before.reps === row.reps &&
            before.weightKg === row.weightKg &&
            before.done === row.done
          ) {
            continue;
          }
          const res = await fetch(`/api/sessions/${sessionId}/logs`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              exerciseId: exercise.id,
              setIndex: row.setIndex,
              reps: row.reps === "" ? null : parseInt(row.reps, 10),
              weightKg: row.weightKg === "" ? null : parseFloat(row.weightKg),
              done: row.done,
              variationName: row.variationName,
            }),
          });
          if (!res.ok) throw new Error("save");
        }
      }
      setOpen(false);
      setRemoved([]);
      router.refresh();
    } catch {
      setError("Enregistrement impossible. Vérifie ta connexion et réessaie.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={btn("outline", "sm", "mt-1 self-start")}
      >
        <PencilLine size={15} /> Corriger les séries
      </button>

      <BottomSheet open={open} onClose={close}>
        <div className="flex items-baseline justify-between gap-3">
          <div className="min-w-0">
            <p className="overline-label text-accent">Corriger</p>
            <p className="truncate text-[15px] font-bold">{label}</p>
          </div>
          <IconButton aria-label="Fermer" variant="ghost" onClick={close}>
            <X size={17} />
          </IconButton>
        </div>

        <div className="mt-3 max-h-[60vh] space-y-4 overflow-y-auto pr-0.5">
          {exercises.map((exercise) => (
            <div key={exercise.id}>
              <p className="text-sm font-bold">{exercise.name}</p>
              <div className="mt-1.5 flex flex-col gap-1.5">
                {rows[exercise.id].length === 0 && (
                  <p className="text-xs text-muted">Aucune série enregistrée.</p>
                )}
                {rows[exercise.id].map((row) => (
                  <div
                    key={row.setIndex}
                    className="flex items-center gap-2 rounded-[14px] border border-card-border bg-surface p-2"
                  >
                    <button
                      type="button"
                      onClick={() =>
                        patchRow(exercise.id, row.setIndex, { done: !row.done })
                      }
                      aria-label={`Série ${row.setIndex + 1} ${row.done ? "faite" : "passée"}`}
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-extrabold ${
                        row.done
                          ? "bg-accent text-black"
                          : "border-2 border-border text-muted-2"
                      }`}
                    >
                      {row.done ? (
                        <Check size={16} strokeWidth={3} />
                      ) : (
                        row.setIndex + 1
                      )}
                    </button>
                    <label className="flex min-w-0 flex-1 flex-col text-[11px] text-muted">
                      Poids (kg)
                      <input
                        type="number"
                        inputMode="decimal"
                        value={row.weightKg}
                        placeholder="—"
                        onChange={(e) =>
                          patchRow(exercise.id, row.setIndex, {
                            weightKg: e.target.value,
                          })
                        }
                        className="mt-0.5 w-full rounded-full border border-border bg-surface-2 px-3 py-2 font-mono text-sm font-semibold text-ink outline-none focus:border-accent"
                      />
                    </label>
                    <label className="flex min-w-0 flex-1 flex-col text-[11px] text-muted">
                      Reps
                      <input
                        type="number"
                        inputMode="numeric"
                        value={row.reps}
                        placeholder="—"
                        onChange={(e) =>
                          patchRow(exercise.id, row.setIndex, {
                            reps: e.target.value,
                          })
                        }
                        className="mt-0.5 w-full rounded-full border border-border bg-surface-2 px-3 py-2 font-mono text-sm font-semibold text-ink outline-none focus:border-accent"
                      />
                    </label>
                    <IconButton
                      aria-label={`Supprimer la série ${row.setIndex + 1}`}
                      variant="danger"
                      size="sm"
                      onClick={() => removeRow(exercise.id, row.setIndex)}
                    >
                      <Trash2 size={15} />
                    </IconButton>
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={() => addRow(exercise.id)}
                className="mt-1.5 inline-flex items-center gap-1 text-xs font-semibold text-muted-2"
              >
                <Plus size={13} /> Ajouter une série
              </button>
            </div>
          ))}
        </div>

        {error && <p className="mt-3 text-sm text-danger">{error}</p>}

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={close}
            disabled={saving}
            className={btn("outline", "md", "flex-1")}
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className={btn("primary", "md", "flex-[2]")}
          >
            {saving ? (
              <>
                <Loader2 size={16} className="animate-spin" /> Enregistrement…
              </>
            ) : (
              <>
                <Check size={16} /> Enregistrer
              </>
            )}
          </button>
        </div>
      </BottomSheet>
    </>
  );
}
