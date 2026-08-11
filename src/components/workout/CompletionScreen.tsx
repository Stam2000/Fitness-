"use client";

import Link from "next/link";
import { Bot, Loader2, PartyPopper, Timer, Trophy } from "lucide-react";
import { btn } from "@/components/ui/button";
import StatTile from "@/components/ui/StatTile";

type Pr = { name: string; weight: number; previous: number | null };
type ExerciseTime = { name: string; seconds: number };

function formatElapsed(seconds: number) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

/** Écran de fin de séance : stats, records, analyse du coach. */
export default function CompletionScreen({
  programName,
  dayName,
  durationMin,
  doneSetsCount,
  volume,
  exerciseTimes = [],
  prs,
  hasOpenrouterKey,
  feedback,
  feedbackLoading,
  feedbackError,
  onLoadFeedback,
}: {
  programName: string;
  dayName: string;
  durationMin: number | null;
  doneSetsCount: number;
  volume: number;
  /** Temps passé par exercice (chrono automatique), entrées > 0 uniquement. */
  exerciseTimes?: ExerciseTime[];
  prs: Pr[];
  hasOpenrouterKey: boolean;
  feedback: string | null;
  feedbackLoading: boolean;
  feedbackError: string | null;
  onLoadFeedback: () => void;
}) {
  return (
    <main className="mx-auto flex min-h-[70vh] w-full max-w-md flex-col items-center justify-center gap-4 text-center">
      <span className="flex h-20 w-20 items-center justify-center rounded-full bg-accent/10 text-accent">
        <PartyPopper size={40} strokeWidth={1.75} />
      </span>
      <div>
        <h1 className="text-[27px] font-extrabold italic tracking-tight">
          Séance terminée !
        </h1>
        <p className="mt-1 text-[14.5px] text-muted-2">
          {programName} — {dayName}
          {durationMin != null ? ` · ${durationMin} min` : ""}
        </p>
      </div>
      <div className="flex w-full gap-2.5">
        <StatTile
          className="flex-1"
          size="lg"
          value={doneSetsCount}
          label="séries faites"
        />
        <StatTile
          className="flex-1"
          size="lg"
          value={Math.round(volume).toLocaleString("fr-FR")}
          label="kg soulevés (volume)"
        />
      </div>
      {exerciseTimes.length > 0 && (
        <div className="card w-full p-4 text-left">
          <p className="overline-label flex items-center gap-1.5">
            <Timer size={13} /> Temps par exercice
          </p>
          <ul className="mt-2 flex flex-col gap-1.5">
            {exerciseTimes.map((t) => (
              <li
                key={t.name}
                className="flex items-baseline justify-between gap-3 text-sm"
              >
                <span className="min-w-0 truncate">{t.name}</span>
                <span className="shrink-0 font-mono font-bold text-accent">
                  {formatElapsed(t.seconds)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {prs.length > 0 && (
        <div className="w-full rounded-2xl border-[1.5px] border-accent/50 bg-accent/[0.08] p-4 text-left">
          <p className="overline-label flex items-center gap-1.5 text-accent">
            <Trophy size={13} /> Nouveau record personnel
          </p>
          {prs.map((pr) => (
            <p key={pr.name} className="mt-1.5 text-[15px]">
              {pr.name} :{" "}
              <span className="font-extrabold">{pr.weight} kg</span>
              {pr.previous != null && (
                <span className="text-muted-2"> (avant : {pr.previous} kg)</span>
              )}
            </p>
          ))}
        </div>
      )}

      {hasOpenrouterKey && (
        <div className="w-full">
          {feedback ? (
            <div className="card p-4 text-left">
              <p className="flex items-center gap-1.5 text-sm font-extrabold text-accent">
                <Bot size={16} /> Analyse du coach
              </p>
              <p className="mt-2 whitespace-pre-line text-sm text-muted-2">
                {feedback}
              </p>
            </div>
          ) : (
            <button
              onClick={onLoadFeedback}
              disabled={feedbackLoading}
              className={btn("tint", "lg", "w-full")}
            >
              {feedbackLoading ? (
                <>
                  <Loader2 size={17} className="animate-spin" /> Analyse…
                </>
              ) : (
                <>
                  <Bot size={17} /> Analyse du coach
                </>
              )}
            </button>
          )}
          {feedbackError && (
            <p className="mt-2 text-sm text-danger">{feedbackError}</p>
          )}
        </div>
      )}

      <div className="mt-2 flex w-full flex-col items-center gap-2.5">
        <Link href="/history" className={btn("primary", "lg", "w-full")}>
          Voir l&apos;historique
        </Link>
        <Link href="/" className="px-6 py-2 text-[13.5px] font-semibold text-muted">
          Retour à l&apos;accueil
        </Link>
      </div>
    </main>
  );
}
