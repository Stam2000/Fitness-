"use client";

import { Check, Dumbbell, X } from "lucide-react";

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
export default function ExerciseHero({
  option,
  currentIndex,
  totalExercises,
  doneCount,
  totalSets,
  onAbandon,
}: {
  option: HeroOption;
  currentIndex: number;
  totalExercises: number;
  doneCount: number;
  totalSets: number;
  onAbandon: () => void;
}) {
  const counter = (
    <div className="absolute right-3.5 top-3.5 flex items-center gap-1 rounded-full bg-bg/70 px-3 py-2 font-mono text-[12.5px] font-bold">
      {currentIndex}/{totalExercises} · {doneCount}/{totalSets}
      <Check size={13} strokeWidth={3} className="text-accent" />
    </div>
  );
  const closeBtn = (
    <button
      onClick={onAbandon}
      aria-label="Abandonner la séance"
      title="Abandonner la séance"
      className="absolute left-3.5 top-3.5 flex h-9 w-9 items-center justify-center rounded-full bg-bg/70"
    >
      <X size={17} />
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
          <Dumbbell size={48} strokeWidth={1.5} className="text-muted/60" />
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
