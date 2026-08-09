"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import ProgramEditor, { type EditableProgram } from "@/components/ProgramEditor";
import { deleteProgram, startSession, updateProgram } from "@/app/actions";

type ExerciseView = {
  id: string;
  name: string;
  sets: number;
  reps: string;
  restSeconds: number;
  weightHint: string | null;
  equipment: string[];
  notes: string | null;
  imageUrl: string | null;
  imageTaskId: string | null;
};

type ProgramView = {
  id: string;
  name: string;
  description: string | null;
  goal: string | null;
  level: string | null;
  locationLabel: string | null;
  days: {
    id: string;
    name: string;
    focus: string | null;
    exercises: ExerciseView[];
  }[];
};

type ImageState = { status: "idle" | "generating" | "done" | "error"; url?: string; error?: string };

export default function ProgramDetail({ program }: { program: ProgramView }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [openDay, setOpenDay] = useState(0);
  const [images, setImages] = useState<Record<string, ImageState>>(() => {
    const init: Record<string, ImageState> = {};
    for (const day of program.days) {
      for (const ex of day.exercises) {
        init[ex.id] = ex.imageUrl
          ? { status: "done", url: ex.imageUrl }
          : ex.imageTaskId
            ? { status: "generating" }
            : { status: "idle" };
      }
    }
    return init;
  });
  const pollers = useRef<Record<string, ReturnType<typeof setInterval>>>({});

  const pollImage = useCallback((exerciseId: string) => {
    if (pollers.current[exerciseId]) return;
    pollers.current[exerciseId] = setInterval(async () => {
      try {
        const res = await fetch(`/api/exercises/${exerciseId}/image`);
        const json = await res.json();
        if (json.state === "success") {
          clearInterval(pollers.current[exerciseId]);
          delete pollers.current[exerciseId];
          setImages((m) => ({
            ...m,
            [exerciseId]: { status: "done", url: json.imageUrl },
          }));
        } else if (json.state === "fail" || json.error) {
          clearInterval(pollers.current[exerciseId]);
          delete pollers.current[exerciseId];
          setImages((m) => ({
            ...m,
            [exerciseId]: { status: "error", error: json.error ?? "échec" },
          }));
        }
      } catch {
        // erreur réseau passagère : on continue à interroger
      }
    }, 4000);
  }, []);

  useEffect(() => {
    for (const day of program.days) {
      for (const ex of day.exercises) {
        if (ex.imageTaskId && !ex.imageUrl) pollImage(ex.id);
      }
    }
    const current = pollers.current;
    return () => {
      Object.values(current).forEach(clearInterval);
    };
  }, [program, pollImage]);

  async function generateImage(exerciseId: string) {
    setImages((m) => ({ ...m, [exerciseId]: { status: "generating" } }));
    try {
      const res = await fetch(`/api/exercises/${exerciseId}/image`, {
        method: "POST",
      });
      const json = await res.json();
      if (!res.ok) {
        setImages((m) => ({
          ...m,
          [exerciseId]: { status: "error", error: json.error },
        }));
        return;
      }
      pollImage(exerciseId);
    } catch {
      setImages((m) => ({
        ...m,
        [exerciseId]: { status: "error", error: "erreur réseau" },
      }));
    }
  }

  async function generateAll() {
    for (const day of program.days) {
      for (const ex of day.exercises) {
        const state = images[ex.id];
        if (state?.status === "idle" || state?.status === "error") {
          await generateImage(ex.id);
        }
      }
    }
  }

  async function save(edited: EditableProgram) {
    setSaving(true);
    try {
      await updateProgram(program.id, {
        name: edited.name,
        description: edited.description ?? null,
        days: edited.days.map((d) => ({
          id: d.id,
          name: d.name,
          focus: d.focus ?? null,
          exercises: d.exercises.map((ex) => ({
            id: ex.id,
            name: ex.name,
            sets: ex.sets,
            reps: ex.reps,
            restSeconds: ex.restSeconds,
            weightHint: ex.weightHint ?? null,
            equipment: ex.equipment ?? [],
            notes: ex.notes ?? null,
          })),
        })),
      });
      setEditing(false);
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  const missingImages = program.days
    .flatMap((d) => d.exercises)
    .filter((ex) => images[ex.id]?.status !== "done").length;

  if (editing) {
    return (
      <main className="flex flex-col gap-4">
        <header className="flex items-center justify-between pt-2">
          <h1 className="text-xl font-bold">Modifier le programme</h1>
          <button onClick={() => setEditing(false)} className="text-sm text-muted">
            Annuler
          </button>
        </header>
        <ProgramEditor
          initial={{
            name: program.name,
            description: program.description,
            days: program.days,
          }}
          onSave={save}
          saveLabel="💾 Enregistrer les modifications"
          saving={saving}
        />
      </main>
    );
  }

  return (
    <main className="flex flex-col gap-4">
      <header className="pt-2">
        <div className="flex items-start justify-between gap-3">
          <h1 className="text-2xl font-bold">{program.name}</h1>
          <button
            onClick={() => setEditing(true)}
            className="shrink-0 rounded-lg border border-border px-3 py-1.5 text-sm"
          >
            ✏️ Modifier
          </button>
        </div>
        <p className="mt-1 text-sm text-muted">
          {[program.locationLabel, program.goal, program.level]
            .filter(Boolean)
            .join(" · ")}
        </p>
        {program.description && (
          <p className="mt-2 text-sm text-muted">{program.description}</p>
        )}
      </header>

      {missingImages > 0 && (
        <button
          onClick={generateAll}
          className="rounded-xl border border-accent/50 bg-accent/10 py-3 text-sm font-semibold text-accent"
        >
          🎨 Générer les images des exercices ({missingImages})
        </button>
      )}

      {program.days.map((day, di) => (
        <section
          key={day.id}
          className="rounded-2xl border border-border bg-surface"
        >
          <button
            onClick={() => setOpenDay(openDay === di ? -1 : di)}
            className="flex w-full items-center justify-between p-4 text-left"
          >
            <div>
              <h2 className="font-semibold">{day.name}</h2>
              <p className="text-xs text-muted">
                {day.focus ? `${day.focus} · ` : ""}
                {day.exercises.length} exercice
                {day.exercises.length > 1 ? "s" : ""}
              </p>
            </div>
            <span className="text-muted">{openDay === di ? "▾" : "▸"}</span>
          </button>

          {openDay === di && (
            <div className="flex flex-col gap-3 border-t border-border p-3">
              {day.exercises.map((ex) => {
                const img = images[ex.id];
                return (
                  <div
                    key={ex.id}
                    className="overflow-hidden rounded-xl bg-surface-2"
                  >
                    {img?.status === "done" && img.url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={img.url}
                        alt={ex.name}
                        className="aspect-[3/2] w-full object-cover"
                      />
                    ) : (
                      <div className="flex aspect-[3/2] w-full flex-col items-center justify-center gap-2 bg-bg/60">
                        {img?.status === "generating" ? (
                          <>
                            <span className="animate-pulse text-3xl">🎨</span>
                            <span className="text-xs text-muted">
                              Génération de l&apos;image…
                            </span>
                          </>
                        ) : (
                          <>
                            <span className="text-3xl">🏋️</span>
                            <button
                              onClick={() => generateImage(ex.id)}
                              className="rounded-lg border border-border px-3 py-1.5 text-xs text-muted"
                            >
                              {img?.status === "error"
                                ? "Réessayer l'image"
                                : "Générer l'image"}
                            </button>
                            {img?.status === "error" && (
                              <span className="max-w-[80%] text-center text-[10px] text-danger">
                                {img.error}
                              </span>
                            )}
                          </>
                        )}
                      </div>
                    )}
                    <div className="p-3">
                      <div className="flex items-baseline justify-between gap-2">
                        <h3 className="font-medium">{ex.name}</h3>
                        {img?.status === "done" && (
                          <button
                            onClick={() => generateImage(ex.id)}
                            className="shrink-0 text-xs text-muted underline"
                          >
                            régénérer
                          </button>
                        )}
                      </div>
                      <p className="mt-1 text-sm text-accent">
                        {ex.sets} × {ex.reps}
                        <span className="text-muted">
                          {" "}
                          · repos {ex.restSeconds}s
                          {ex.weightHint ? ` · ${ex.weightHint}` : ""}
                        </span>
                      </p>
                      {ex.equipment.length > 0 && (
                        <p className="mt-1 text-xs text-muted">
                          🏋️ {ex.equipment.join(", ")}
                        </p>
                      )}
                      {ex.notes && (
                        <p className="mt-1 text-xs text-muted">💡 {ex.notes}</p>
                      )}
                    </div>
                  </div>
                );
              })}

              <form action={startSession.bind(null, day.id)}>
                <button
                  type="submit"
                  className="w-full rounded-xl bg-accent py-3.5 font-semibold text-black"
                >
                  ▶️ Démarrer cette séance
                </button>
              </form>
            </div>
          )}
        </section>
      ))}

      <button
        onClick={() => {
          if (confirm(`Supprimer le programme « ${program.name} » ?`)) {
            deleteProgram(program.id);
          }
        }}
        className="pb-2 text-sm text-danger"
      >
        Supprimer ce programme
      </button>
    </main>
  );
}
