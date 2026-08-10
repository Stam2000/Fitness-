"use client";

import Link from "next/link";
import { btn } from "@/components/ui/button";
import StatTile from "@/components/ui/StatTile";

type Pr = { name: string; weight: number; previous: number | null };

/** Écran de fin de séance : stats, records, analyse du coach. */
export default function CompletionScreen({
  programName,
  dayName,
  durationMin,
  doneSetsCount,
  volume,
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
  prs: Pr[];
  hasOpenrouterKey: boolean;
  feedback: string | null;
  feedbackLoading: boolean;
  feedbackError: string | null;
  onLoadFeedback: () => void;
}) {
  return (
    <main className="mx-auto flex min-h-[70vh] w-full max-w-md flex-col items-center justify-center gap-4 text-center">
      <p className="text-[56px] leading-none">🎉</p>
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
      {prs.length > 0 && (
        <div className="w-full rounded-2xl border-[1.5px] border-accent/50 bg-accent/[0.08] p-4 text-left">
          <p className="overline-label text-accent">
            ★ Nouveau record personnel
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
              <p className="text-sm font-extrabold text-accent">
                🤖 Analyse du coach
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
              {feedbackLoading
                ? "🤖 Le coach analyse ta séance…"
                : "🤖 Demander l'analyse du coach"}
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
