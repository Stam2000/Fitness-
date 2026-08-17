"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Camera, ChevronRight, Flame } from "lucide-react";
import { btn } from "@/components/ui/button";
import MealComposer from "@/components/meals/MealComposer";
import { progressPct, type MacroTotals } from "@/lib/meals";

type MealQuickCaptureProps = {
  dayKey: string;
  totals: MacroTotals;
  targetKcal: number | null;
  targetProteinG: number | null;
  mealCount: number;
  /** Questions de l'IA restées sans réponse sur la journée. */
  pendingCount: number;
  hasAiKey: boolean;
};

/**
 * Carte d'accueil : l'état calorique du jour et, surtout, l'accès en un appui
 * à l'appareil photo. C'est la fonctionnalité la plus fréquente de la
 * journée — la reléguer à deux niveaux de navigation la ferait abandonner.
 */
export default function MealQuickCapture({
  dayKey,
  totals,
  targetKcal,
  targetProteinG,
  mealCount,
  pendingCount,
  hasAiKey,
}: MealQuickCaptureProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const kcal = Math.round(totals.kcal);

  return (
    <section className="card p-4">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="overline-label flex items-center gap-1.5">
            <Flame size={13} className="text-accent" /> Repas du jour
          </h2>
          <p className="mt-1.5 font-mono text-[22px] font-bold leading-none text-accent">
            {kcal}
            {targetKcal ? (
              <span className="text-[13px] font-medium text-muted-2">
                {" "}
                / {targetKcal} kcal
              </span>
            ) : (
              <span className="text-[13px] font-medium text-muted-2"> kcal</span>
            )}
          </p>
          <p className="mt-1 text-[12px] text-muted-2">
            {Math.round(totals.proteinG)} g de protéines
            {targetProteinG ? ` / ${targetProteinG} g` : ""}
            {mealCount > 0 ? ` · ${mealCount} repas` : ""}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={btn("primary", "md", "shrink-0")}
        >
          <Camera size={18} /> Photo
        </button>
      </div>

      {targetKcal ? (
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-2">
          <div
            className="h-full rounded-full bg-accent transition-[width]"
            style={{ width: `${progressPct(totals.kcal, targetKcal)}%` }}
          />
        </div>
      ) : null}

      <Link
        href="/body/meals"
        className="mt-3 flex items-center gap-1.5 border-t border-border pt-3 text-[13px] font-semibold text-muted-2 hover:text-ink"
      >
        <span className="min-w-0 flex-1">
          {pendingCount > 0 ? (
            <span className="text-warm">
              {pendingCount} question{pendingCount > 1 ? "s" : ""} de l&apos;IA
              sans réponse
            </span>
          ) : (
            "Voir le détail du jour"
          )}
        </span>
        <ChevronRight size={15} className="shrink-0" />
      </Link>

      <MealComposer
        open={open}
        onClose={() => setOpen(false)}
        dayKey={dayKey}
        hasAiKey={hasAiKey}
        onDone={() => router.refresh()}
      />
    </section>
  );
}
