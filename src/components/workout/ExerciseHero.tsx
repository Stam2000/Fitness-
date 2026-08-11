"use client";

type HeroOption = {
  name: string;
  sets: number;
  reps: string;
  restSeconds: number;
  equipment: string[];
  imageUrl: string | null;
  videoUrl: string | null;
};

/**
 * Héros de l'exercice en cours : média 250px avec ✕, compteur mono et
 * nom + objectifs en overlay. La vidéo garde ses contrôles : overlays
 * hauts seulement, texte en dessous.
 */
function formatElapsed(seconds: number) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export default function ExerciseHero({
  option,
  currentIndex,
  totalExercises,
  doneCount,
  totalSets,
  elapsedSeconds = 0,
  onAbandon,
}: {
  option: HeroOption;
  currentIndex: number;
  totalExercises: number;
  doneCount: number;
  totalSets: number;
  /** Temps déjà passé sur cet exercice (chrono automatique). */
  elapsedSeconds?: number;
  onAbandon: () => void;
}) {
  const counter = (
    <div className="absolute right-3.5 top-3.5 flex flex-col items-end gap-1.5">
      <div className="rounded-full bg-bg/70 px-3 py-2 font-mono text-[12.5px] font-bold">
        {currentIndex}/{totalExercises} · {doneCount}/{totalSets} ✓
      </div>
      <div className="rounded-full bg-bg/70 px-3 py-1.5 font-mono text-[12.5px] font-bold text-accent">
        ⏱ {formatElapsed(elapsedSeconds)}
      </div>
    </div>
  );
  const closeBtn = (
    <button
      onClick={onAbandon}
      aria-label="Abandonner la séance"
      className="absolute left-3.5 top-3.5 flex h-9 w-9 items-center justify-center rounded-full bg-bg/70 text-[15px]"
    >
      ✕
    </button>
  );
  const targets = (
    <p className="font-extrabold text-accent">
      {option.sets} × {option.reps}{" "}
      <span className="text-sm font-semibold text-ink/85">
        · repos {option.restSeconds} s
        {option.equipment.length > 0 ? ` · ${option.equipment[0]}` : ""}
      </span>
    </p>
  );

  if (option.videoUrl) {
    return (
      <section className="card overflow-hidden">
        <div className="relative">
          {/* Démo du mouvement en boucle, muette pour ne pas gêner la séance. */}
          <video
            key={option.videoUrl}
            src={option.videoUrl}
            poster={option.imageUrl ?? undefined}
            autoPlay
            muted
            loop
            playsInline
            controls
            className="aspect-video w-full bg-black object-contain"
          />
          {closeBtn}
          {counter}
        </div>
        <div className="px-4 pb-3.5 pt-3">
          <h1 className="text-2xl font-extrabold italic leading-tight tracking-tight">
            {option.name}
          </h1>
          <div className="mt-1 text-[17px]">{targets}</div>
        </div>
      </section>
    );
  }

  return (
    <section className="relative h-[250px] overflow-hidden rounded-2xl border border-card-border">
      {option.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={option.imageUrl}
          alt={option.name}
          className="h-full w-full object-cover"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-surface-2 to-bg">
          <span className="text-5xl opacity-60">🏋️</span>
        </div>
      )}
      <div className="absolute inset-0 bg-gradient-to-b from-bg/55 via-bg/0 to-bg/95" />
      {closeBtn}
      {counter}
      <div className="absolute inset-x-4 bottom-3.5">
        <h1 className="text-2xl font-extrabold italic leading-tight tracking-tight text-white">
          {option.name}
        </h1>
        <div className="mt-1 text-[17px]">{targets}</div>
      </div>
    </section>
  );
}
