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
import { btn } from "@/components/ui/button";
import Chip from "@/components/ui/Chip";

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
          <h1 className="text-xl font-extrabold italic tracking-tight">
            Modifier le programme
          </h1>
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
          <h1 className="text-[21px] font-extrabold italic leading-tight tracking-tight">
            {program.name}
          </h1>
          <button
            onClick={() => setEditing(true)}
            className="shrink-0 rounded-full border border-border px-3.5 py-2 text-sm"
          >
            ✏️
          </button>
        </div>
        <p className="mt-1 text-[13.5px] text-muted-2">
          {[program.locationLabel, program.goal, program.level]
            .filter(Boolean)
            .join(" · ")}
        </p>
        {program.description && (
          <p className="mt-2 text-sm text-muted-2">{program.description}</p>
        )}
      </header>

      {(missingImages > 0 || missingVideos > 0) && (
        <div className="flex flex-wrap gap-2">
          {missingImages > 0 && (
            <button
              onClick={() => generateAll("image")}
              className={btn("tint", "md")}
            >
              🎨 Images ({missingImages})
            </button>
          )}
          {missingVideos > 0 && (
            <button
              onClick={() => generateAll("video")}
              className={btn("tint", "md")}
            >
              🎬 Vidéos ({missingVideos})
            </button>
          )}
        </div>
      )}

      {program.days.map((day, di) => (
        <section key={day.id} className="card">
          <button
            onClick={() => setOpenDay(openDay === di ? -1 : di)}
            className="flex w-full items-center gap-3.5 p-4 text-left"
          >
            <span
              className={`font-mono text-[22px] font-extrabold ${
                openDay === di ? "text-accent" : "text-muted/60"
              }`}
            >
              {String(di + 1).padStart(2, "0")}
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="truncate text-[15.5px] font-extrabold">
                {day.name}
              </h2>
              <p className="text-[12.5px] text-muted-2">
                {day.focus ? `${day.focus} · ` : ""}
                {day.exercises.length} exercice
                {day.exercises.length > 1 ? "s" : ""} ·{" "}
                {day.exercises.reduce((a, e) => a + e.sets, 0)} séries
              </p>
            </div>
            <span className={openDay === di ? "text-accent" : "text-muted-2"}>
              {openDay === di ? "▾" : "▸"}
            </span>
          </button>

          {openDay === di && (
            <div className="flex flex-col gap-3.5 border-t border-card-border p-3">
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {day.exercises.map((ex) => {
                const img = media[mediaKey("image", ex.id)];
                const vid = media[mediaKey("video", ex.id)];
                return (
                  <div key={ex.id} className="card overflow-hidden">
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
                      <div className="relative aspect-[3/2] w-full">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={img.url}
                          alt={ex.name}
                          className="h-full w-full object-cover"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/15 to-transparent" />
                        <p className="absolute bottom-2.5 left-3.5 right-3.5 text-[17.5px] font-extrabold leading-tight text-white">
                          {ex.name}
                        </p>
                      </div>
                    ) : (
                      <div className="relative flex aspect-[3/2] w-full flex-col items-center justify-center gap-2 bg-gradient-to-br from-surface-2 to-bg">
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
                              className="rounded-full border border-border px-3.5 py-1.5 text-xs text-muted-2"
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
                        <p className="absolute bottom-2.5 left-3.5 right-3.5 text-[17.5px] font-extrabold leading-tight">
                          {ex.name}
                        </p>
                      </div>
                    )}
                    <div className="p-3.5">
                      {(vid?.status === "done" && vid.url) && (
                        <h3 className="mb-1.5 text-[17.5px] font-extrabold leading-tight">
                          {ex.name}
                        </h3>
                      )}
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="rounded-full bg-accent px-3 py-1.5 text-[13.5px] font-extrabold text-black">
                          {ex.sets} × {ex.reps}
                        </span>
                        <span className="rounded-full bg-surface-2 px-3 py-1.5 text-[12.5px] font-semibold">
                          ⏱ {ex.restSeconds} s
                        </span>
                        {ex.equipment.length > 0 && (
                          <span className="max-w-full truncate rounded-full bg-surface-2 px-3 py-1.5 text-[12.5px] font-semibold text-muted-2">
                            🏋️ {ex.equipment.join(", ")}
                          </span>
                        )}
                      </div>
                      {ex.weightHint && (
                        <p className="mt-1.5 text-xs text-muted-2">
                          ⚖️ {ex.weightHint}
                        </p>
                      )}
                      {ex.notes && (
                        <p className="mt-1.5 text-[13px] leading-relaxed text-muted-2">
                          💡 {ex.notes}
                        </p>
                      )}
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                        {img?.status === "done" && (
                          <button
                            onClick={() =>
                              generateMedia("image", "exercise", ex.id)
                            }
                            className="text-muted underline"
                          >
                            🎨 régénérer l&apos;image
                          </button>
                        )}
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
                            🎬 régénérer la vidéo
                          </button>
                        ) : (
                          <button
                            onClick={() =>
                              generateMedia("video", "exercise", ex.id)
                            }
                            className="rounded-full border border-border px-3 py-1.5 text-muted-2"
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
                      {ex.variations.length > 0 && (
                        <div className="mt-2.5 border-t border-card-border pt-2.5">
                          <p className="text-xs font-bold text-muted-2">
                            🔁 En alternance selon les semaines :
                          </p>
                          {ex.variations.map((v, vi) => {
                            const vimg = media[mediaKey("image", v.id)];
                            const vvid = media[mediaKey("video", v.id)];
                            return (
                              <div
                                key={v.id}
                                className="mt-2 flex items-center gap-2.5"
                              >
                                {vimg?.status === "done" && vimg.url ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img
                                    src={vimg.url}
                                    alt={v.name}
                                    className="h-[34px] w-[46px] shrink-0 rounded-lg object-cover"
                                  />
                                ) : (
                                  <button
                                    onClick={() =>
                                      generateMedia("image", "variation", v.id)
                                    }
                                    className="flex h-[34px] w-[46px] shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-surface-2 to-bg text-sm"
                                    aria-label={`Générer l'image de ${v.name}`}
                                  >
                                    {vimg?.status === "generating" ? (
                                      <span className="animate-pulse">🎨</span>
                                    ) : (
                                      "🏋️"
                                    )}
                                  </button>
                                )}
                                <p className="min-w-0 flex-1 text-[12.5px] leading-snug text-muted-2">
                                  <span className="font-bold text-ink">
                                    {String.fromCharCode(66 + vi)} · {v.name}
                                  </span>{" "}
                                  —{" "}
                                  <span className="font-mono">
                                    {v.sets} × {v.reps} · repos {v.restSeconds} s
                                  </span>
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
                  className={btn("primary", "lg", "w-full text-[17px]")}
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
          className={btn("outline", "md", "flex-1")}
        >
          {duplicating ? "Duplication…" : "📋 Dupliquer"}
        </button>
        {hasOpenrouterKey && locations.length > 1 && (
          <button
            onClick={() => setShowConvert((v) => !v)}
            className={btn("outline", "md", "flex-1")}
          >
            🔄 Adapter
          </button>
        )}
      </div>

      {showConvert && (
        <div className="card p-3.5">
          <p className="text-sm font-extrabold">
            Adapter ce programme à l&apos;équipement de :
          </p>
          <div className="mt-2.5 flex flex-wrap gap-2">
            {locations.map((l) => (
              <Chip
                key={l.id}
                active={convertTarget === l.id}
                activeStyle="solid"
                onClick={() => setConvertTarget(l.id)}
              >
                {l.icon} {l.name}
              </Chip>
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
            className={btn("primary", "md", "mt-3 w-full")}
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
        className="pb-2 text-sm font-semibold text-danger"
      >
        Supprimer ce programme
      </button>
    </main>
  );
}
