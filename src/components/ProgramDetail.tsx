"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import ProgramEditor, { type EditableProgram } from "@/components/ProgramEditor";
import {
  deleteProgram,
  duplicateProgram,
  startSession,
  updateProgram,
} from "@/app/actions";

type VariationView = {
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
  videoUrl: string | null;
  videoTaskId: string | null;
};

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
  videoUrl: string | null;
  videoTaskId: string | null;
  variations: VariationView[];
};

// Les médias (images et vidéos de démonstration) sont gérés d'un seul tenant
// pour les exercices et leurs variantes ; seul l'endpoint d'API diffère.
type MediaKind = "exercise" | "variation";
type MediaType = "image" | "video";

function mediaEndpoint(media: MediaType, kind: MediaKind, id: string) {
  return kind === "exercise"
    ? `/api/exercises/${id}/${media}`
    : `/api/variations/${id}/${media}`;
}

// Les deux médias d'un même exercice partagent la map d'état : clé composée.
const mediaKey = (media: MediaType, id: string) => `${media}:${id}`;

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

type MediaState = { status: "idle" | "generating" | "done" | "error"; url?: string; error?: string };

export default function ProgramDetail({
  program,
  locations,
  hasOpenrouterKey,
}: {
  program: ProgramView;
  locations: { id: string; name: string; icon: string | null }[];
  hasOpenrouterKey: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [openDay, setOpenDay] = useState(0);
  const [duplicating, setDuplicating] = useState(false);
  const [showConvert, setShowConvert] = useState(false);
  const [convertTarget, setConvertTarget] = useState<string | null>(null);
  const [converting, setConverting] = useState(false);
  const [convertError, setConvertError] = useState<string | null>(null);
  const [media, setMedia] = useState<Record<string, MediaState>>(() => {
    const init: Record<string, MediaState> = {};
    const seed = (item: VariationView | ExerciseView) => {
      init[mediaKey("image", item.id)] = item.imageUrl
        ? { status: "done", url: item.imageUrl }
        : item.imageTaskId
          ? { status: "generating" }
          : { status: "idle" };
      init[mediaKey("video", item.id)] = item.videoUrl
        ? { status: "done", url: item.videoUrl }
        : item.videoTaskId
          ? { status: "generating" }
          : { status: "idle" };
    };
    for (const day of program.days) {
      for (const ex of day.exercises) {
        seed(ex);
        ex.variations.forEach(seed);
      }
    }
    return init;
  });
  const pollers = useRef<Record<string, ReturnType<typeof setInterval>>>({});

  const pollMedia = useCallback(
    (type: MediaType, kind: MediaKind, id: string) => {
      const key = mediaKey(type, id);
      if (pollers.current[key]) return;
      pollers.current[key] = setInterval(async () => {
        try {
          const res = await fetch(mediaEndpoint(type, kind, id));
          const json = await res.json();
          if (json.state === "success") {
            clearInterval(pollers.current[key]);
            delete pollers.current[key];
            setMedia((m) => ({
              ...m,
              [key]: {
                status: "done",
                url: type === "image" ? json.imageUrl : json.videoUrl,
              },
            }));
          } else if (json.state === "fail" || json.error) {
            clearInterval(pollers.current[key]);
            delete pollers.current[key];
            setMedia((m) => ({
              ...m,
              [key]: { status: "error", error: json.error ?? "échec" },
            }));
          }
        } catch {
          // erreur réseau passagère : on continue à interroger
        }
      }, 4000);
    },
    []
  );

  useEffect(() => {
    const track = (kind: MediaKind, item: VariationView | ExerciseView) => {
      if (item.imageTaskId && !item.imageUrl) pollMedia("image", kind, item.id);
      if (item.videoTaskId && !item.videoUrl) pollMedia("video", kind, item.id);
    };
    for (const day of program.days) {
      for (const ex of day.exercises) {
        track("exercise", ex);
        for (const v of ex.variations) track("variation", v);
      }
    }
    const current = pollers.current;
    return () => {
      Object.values(current).forEach(clearInterval);
    };
  }, [program, pollMedia]);

  async function generateMedia(type: MediaType, kind: MediaKind, id: string) {
    const key = mediaKey(type, id);
    setMedia((m) => ({ ...m, [key]: { status: "generating" } }));
    try {
      const res = await fetch(mediaEndpoint(type, kind, id), {
        method: "POST",
      });
      const json = await res.json();
      if (!res.ok) {
        setMedia((m) => ({
          ...m,
          [key]: { status: "error", error: json.error },
        }));
        return;
      }
      // Média dédupliqué (même nom déjà généré) : succès immédiat sans tâche
      // Kie à interroger.
      const url = type === "image" ? json.imageUrl : json.videoUrl;
      if (json.state === "success" && url) {
        setMedia((m) => ({ ...m, [key]: { status: "done", url } }));
        return;
      }
      pollMedia(type, kind, id);
    } catch {
      setMedia((m) => ({
        ...m,
        [key]: { status: "error", error: "erreur réseau" },
      }));
    }
  }

  async function generateAll(type: MediaType) {
    const items: { kind: MediaKind; id: string }[] = [];
    for (const day of program.days) {
      for (const ex of day.exercises) {
        items.push({ kind: "exercise", id: ex.id });
        for (const v of ex.variations) {
          items.push({ kind: "variation", id: v.id });
        }
      }
    }
    for (const item of items) {
      const state = media[mediaKey(type, item.id)];
      if (state?.status === "idle" || state?.status === "error") {
        await generateMedia(type, item.kind, item.id);
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

  const allIds = program.days
    .flatMap((d) => d.exercises)
    .flatMap((ex) => [ex.id, ...ex.variations.map((v) => v.id)]);
  const missingImages = allIds.filter(
    (id) => media[mediaKey("image", id)]?.status !== "done"
  ).length;
  const missingVideos = allIds.filter(
    (id) => media[mediaKey("video", id)]?.status !== "done"
  ).length;

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

      {(missingImages > 0 || missingVideos > 0) && (
        <div className="flex flex-col gap-2 sm:flex-row">
          {missingImages > 0 && (
            <button
              onClick={() => generateAll("image")}
              className="flex-1 rounded-xl border border-accent/50 bg-accent/10 py-3 text-sm font-semibold text-accent"
            >
              🎨 Générer les images ({missingImages})
            </button>
          )}
          {missingVideos > 0 && (
            <button
              onClick={() => generateAll("video")}
              className="flex-1 rounded-xl border border-accent/50 bg-accent/10 py-3 text-sm font-semibold text-accent"
            >
              🎬 Générer les vidéos ({missingVideos})
            </button>
          )}
        </div>
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
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {day.exercises.map((ex) => {
                const img = media[mediaKey("image", ex.id)];
                const vid = media[mediaKey("video", ex.id)];
                return (
                  <div
                    key={ex.id}
                    className="overflow-hidden rounded-xl bg-surface-2"
                  >
                    {vid?.status === "done" && vid.url ? (
                      <video
                        src={vid.url}
                        poster={img?.url}
                        controls
                        muted
                        loop
                        playsInline
                        className="aspect-video w-full bg-black object-contain"
                      />
                    ) : img?.status === "done" && img.url ? (
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
                              onClick={() =>
                                generateMedia("image", "exercise", ex.id)
                              }
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
                            onClick={() =>
                              generateMedia("image", "exercise", ex.id)
                            }
                            className="shrink-0 text-xs text-muted underline"
                          >
                            régénérer
                          </button>
                        )}
                      </div>
                      <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs">
                        {vid?.status === "generating" ? (
                          <span className="animate-pulse text-muted">
                            🎬 Génération de la vidéo… (1-3 min)
                          </span>
                        ) : vid?.status === "done" ? (
                          <button
                            onClick={() =>
                              generateMedia("video", "exercise", ex.id)
                            }
                            className="text-muted underline"
                          >
                            régénérer la vidéo
                          </button>
                        ) : (
                          <button
                            onClick={() =>
                              generateMedia("video", "exercise", ex.id)
                            }
                            className="rounded-lg border border-border px-2.5 py-1 text-muted"
                          >
                            🎬{" "}
                            {vid?.status === "error"
                              ? "Réessayer la vidéo"
                              : "Générer la vidéo"}
                          </button>
                        )}
                        {vid?.status === "error" && (
                          <span className="text-[10px] text-danger">
                            {vid.error}
                          </span>
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
                      {ex.variations.length > 0 && (
                        <div className="mt-2 border-t border-border pt-2">
                          <p className="text-xs font-semibold text-muted">
                            🔁 En alternance selon les semaines :
                          </p>
                          {ex.variations.map((v, vi) => {
                            const vimg = media[mediaKey("image", v.id)];
                            const vvid = media[mediaKey("video", v.id)];
                            return (
                              <div
                                key={v.id}
                                className="mt-1.5 flex items-center gap-2"
                              >
                                {vimg?.status === "done" && vimg.url ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img
                                    src={vimg.url}
                                    alt={v.name}
                                    className="h-10 w-14 shrink-0 rounded-md object-cover"
                                  />
                                ) : (
                                  <button
                                    onClick={() =>
                                      generateMedia("image", "variation", v.id)
                                    }
                                    className="flex h-10 w-14 shrink-0 items-center justify-center rounded-md bg-bg/60 text-sm"
                                    aria-label={`Générer l'image de ${v.name}`}
                                  >
                                    {vimg?.status === "generating" ? (
                                      <span className="animate-pulse">🎨</span>
                                    ) : (
                                      "🏋️"
                                    )}
                                  </button>
                                )}
                                <p className="min-w-0 flex-1 text-xs text-muted">
                                  <span className="font-medium text-ink">
                                    {String.fromCharCode(66 + vi)} · {v.name}
                                  </span>{" "}
                                  — {v.sets} × {v.reps} · repos {v.restSeconds}s
                                </p>
                                {vvid?.status === "done" && vvid.url ? (
                                  <a
                                    href={vvid.url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="shrink-0 text-sm"
                                    aria-label={`Voir la vidéo de ${v.name}`}
                                  >
                                    🎬
                                  </a>
                                ) : (
                                  <button
                                    onClick={() =>
                                      generateMedia("video", "variation", v.id)
                                    }
                                    className="shrink-0 text-sm opacity-60"
                                    aria-label={`Générer la vidéo de ${v.name}`}
                                    title={
                                      vvid?.status === "error"
                                        ? `Vidéo en échec : ${vvid.error ?? ""}`
                                        : "Générer la vidéo"
                                    }
                                  >
                                    {vvid?.status === "generating" ? (
                                      <span className="animate-pulse">🎬</span>
                                    ) : vvid?.status === "error" ? (
                                      "⚠️"
                                    ) : (
                                      "🎬"
                                    )}
                                  </button>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
              </div>

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

      <div className="flex gap-2">
        <button
          onClick={async () => {
            setDuplicating(true);
            try {
              const id = await duplicateProgram(program.id);
              router.push(`/programs/${id}`);
            } finally {
              setDuplicating(false);
            }
          }}
          disabled={duplicating}
          className="flex-1 rounded-xl border border-border py-3 text-sm font-semibold disabled:opacity-50"
        >
          {duplicating ? "Duplication…" : "📋 Dupliquer"}
        </button>
        {hasOpenrouterKey && locations.length > 1 && (
          <button
            onClick={() => setShowConvert((v) => !v)}
            className="flex-1 rounded-xl border border-border py-3 text-sm font-semibold"
          >
            🔄 Adapter à un contexte
          </button>
        )}
      </div>

      {showConvert && (
        <div className="rounded-2xl border border-border bg-surface p-3">
          <p className="text-sm font-semibold">
            Adapter ce programme à l&apos;équipement de :
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {locations.map((l) => (
              <button
                key={l.id}
                onClick={() => setConvertTarget(l.id)}
                className={`rounded-xl px-4 py-2.5 text-sm font-semibold ${
                  convertTarget === l.id
                    ? "bg-accent text-black"
                    : "border border-border"
                }`}
              >
                {l.icon} {l.name}
              </button>
            ))}
          </div>
          {convertError && (
            <p className="mt-2 text-sm text-danger">{convertError}</p>
          )}
          <button
            onClick={async () => {
              if (!convertTarget) return;
              setConverting(true);
              setConvertError(null);
              try {
                const res = await fetch(`/api/programs/${program.id}/convert`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ locationId: convertTarget }),
                });
                const json = await res.json();
                if (!res.ok) {
                  setConvertError(json.error ?? "Erreur");
                  return;
                }
                router.push(`/programs/${json.programId}`);
              } catch {
                setConvertError("Erreur réseau. Réessaie.");
              } finally {
                setConverting(false);
              }
            }}
            disabled={!convertTarget || converting}
            className="mt-3 w-full rounded-xl bg-accent py-3 text-sm font-semibold text-black disabled:opacity-50"
          >
            {converting
              ? "🤖 Adaptation en cours… (10-30 s)"
              : "Créer le programme adapté"}
          </button>
        </div>
      )}

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
