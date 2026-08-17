"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Camera, ChevronLeft, ChevronRight, UtensilsCrossed } from "lucide-react";
import { btn } from "@/components/ui/button";
import StatTile from "@/components/ui/StatTile";
import MealCard, { type PortionChange } from "@/components/meals/MealCard";
import MealComposer from "@/components/meals/MealComposer";
import { setMealItemIncluded, setMealItemPortion, deleteMeal } from "@/app/actions";
import {
  dayTotals,
  dayUpperTotals,
  formatDayLabel,
  openQuestions,
  progressPct,
  scaleItemBy,
  shiftIsoDay,
  type DayTargets,
  type MealItemView,
  type MealView,
} from "@/lib/meals";

type MealDayProps = {
  dayKey: string;
  todayKey: string;
  meals: MealView[];
  targets: DayTargets;
  hasAiKey: boolean;
};

// Corrections locales en attente de confirmation serveur, par identifiant de
// ligne. Un état simple plutôt que useOptimistic : la page est
// `force-dynamic`, et useOptimistic rend la main dès la fin de la transition —
// la case reviendrait visiblement en arrière avant l'arrivée du nouveau rendu.
type Override = { included?: boolean; factor?: number };

export default function MealDay({
  dayKey,
  todayKey,
  meals,
  targets,
  hasAiKey,
}: MealDayProps) {
  const router = useRouter();
  const [composerOpen, setComposerOpen] = useState(false);
  const [overrides, setOverrides] = useState<Record<string, Override>>({});
  const [retrying, setRetrying] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const view = meals.map((meal) => ({
    ...meal,
    items: meal.items.map((item) => applyOverride(item, overrides[item.id])),
  }));

  const totals = dayTotals(view);
  const upper = dayUpperTotals(view);
  const pendingCount = view.reduce(
    (n, m) => n + openQuestions(m.items).length,
    0
  );
  const pendingKcal = Math.round(upper.kcal - totals.kcal);

  // Une correction locale ne vit que le temps de l'écriture : la Server Action
  // termine par revalidatePath, si bien qu'à la résolution de la promesse le
  // rendu serveur fait de nouveau autorité. La garder ensuite la ferait
  // diverger de la base — et un échec doit rendre la main, pas figer un
  // affichage faux.
  function clearOverride(itemId: string) {
    setOverrides((p) => {
      const next = { ...p };
      delete next[itemId];
      return next;
    });
  }

  function answer(itemId: string, included: boolean) {
    setOverrides((p) => ({ ...p, [itemId]: { ...p[itemId], included } }));
    startTransition(async () => {
      try {
        await setMealItemIncluded(itemId, included);
      } finally {
        clearOverride(itemId);
      }
    });
  }

  function portion(item: MealItemView, change: PortionChange) {
    // Correction locale exprimée en facteur dans les deux cas : une saisie en
    // grammes se ramène au rapport avec la masse estimée, ce qui suffit à
    // faire bouger le total avant la réponse du serveur.
    const factor =
      "grams" in change
        ? item.grams
          ? change.grams / item.grams
          : 1
        : change.factor;
    setOverrides((p) => ({
      ...p,
      [item.id]: { ...p[item.id], factor: (p[item.id]?.factor ?? 1) * factor },
    }));
    startTransition(async () => {
      try {
        await setMealItemPortion(item.id, change);
      } finally {
        clearOverride(item.id);
      }
    });
  }

  function retry(mealId: string) {
    setRetrying(mealId);
    void fetch(`/api/meals/${mealId}/analyze`, { method: "POST" }).finally(
      () => {
        setRetrying(null);
        router.refresh();
      }
    );
  }

  function remove(mealId: string) {
    startTransition(async () => {
      await deleteMeal(mealId);
      router.refresh();
    });
  }

  const isToday = dayKey === todayKey;

  return (
    <div className="flex flex-col gap-4">
      <nav className="flex items-center gap-2">
        <Link
          href={`/body/meals?jour=${shiftIsoDay(dayKey, -1)}`}
          className={btn("outline", "sm", "shrink-0")}
          aria-label="Jour précédent"
        >
          <ChevronLeft size={16} />
        </Link>
        <p className="flex-1 text-center text-[14px] font-bold capitalize">
          {formatDayLabel(dayKey, todayKey)}
        </p>
        {isToday ? (
          // Pas de journal dans le futur : le bouton reste en place pour ne
          // pas faire sauter la mise en page, mais inerte.
          <span className={btn("outline", "sm", "shrink-0 opacity-30")}>
            <ChevronRight size={16} />
          </span>
        ) : (
          <Link
            href={`/body/meals?jour=${shiftIsoDay(dayKey, 1)}`}
            className={btn("outline", "sm", "shrink-0")}
            aria-label="Jour suivant"
          >
            <ChevronRight size={16} />
          </Link>
        )}
      </nav>

      <section className="flex flex-col gap-2">
        <div className="grid grid-cols-4 gap-2">
          <StatTile
            value={Math.round(totals.kcal)}
            label="kcal"
            hint={targets.kcal ? `/ ${targets.kcal}` : undefined}
          />
          <StatTile
            value={Math.round(totals.proteinG)}
            label="protéines"
            hint={targets.proteinG ? `/ ${targets.proteinG} g` : undefined}
          />
          <StatTile
            value={Math.round(totals.carbsG)}
            label="glucides"
            hint={targets.carbsG ? `/ ${targets.carbsG} g` : undefined}
          />
          <StatTile
            value={Math.round(totals.fatG)}
            label="lipides"
            hint={targets.fatG ? `/ ${targets.fatG} g` : undefined}
          />
        </div>

        {targets.kcal ? (
          <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
            <div
              className="h-full rounded-full bg-accent transition-[width]"
              style={{ width: `${progressPct(totals.kcal, targets.kcal)}%` }}
            />
          </div>
        ) : (
          <p className="text-center text-[11.5px] text-muted">
            Fixe un objectif dans{" "}
            <Link href="/body" className="text-accent">
              Suivi corporel
            </Link>{" "}
            pour comparer.
          </p>
        )}

        {pendingCount > 0 && (
          <p className="text-center text-[12px] text-warm">
            {pendingCount} question{pendingCount > 1 ? "s" : ""} sans réponse —
            jusqu&apos;à {Math.round(upper.kcal)} kcal (+{pendingKcal})
          </p>
        )}
      </section>

      {view.length === 0 ? (
        <div className="card p-6 text-center">
          <UtensilsCrossed
            size={36}
            strokeWidth={1.5}
            className="mx-auto text-muted"
          />
          <p className="mt-3 text-sm text-muted-2">
            Aucun repas {isToday ? "aujourd'hui" : "ce jour-là"}.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {view.map((meal) => (
            <MealCard
              key={meal.id}
              meal={meal}
              onAnswer={answer}
              onPortion={portion}
              onRetry={retry}
              onDelete={remove}
              retrying={retrying === meal.id}
            />
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={() => setComposerOpen(true)}
        className={btn("primary", "lg", "w-full")}
      >
        <Camera size={19} /> Photographier un repas
      </button>

      <MealComposer
        open={composerOpen}
        onClose={() => setComposerOpen(false)}
        dayKey={dayKey}
        hasAiKey={hasAiKey}
        onDone={() => router.refresh()}
      />
    </div>
  );
}

function applyOverride(
  item: MealItemView,
  override: Override | undefined
): MealItemView {
  if (!override) return item;
  const scaled = override.factor
    ? scaleItemBy(
        {
          kcal: item.kcal,
          proteinG: item.proteinG,
          carbsG: item.carbsG,
          fatG: item.fatG,
          grams: item.grams,
        },
        override.factor
      )
    : null;
  return {
    ...item,
    ...(scaled ?? {}),
    ...(override.included === undefined
      ? {}
      : { included: override.included, answered: true }),
  };
}
