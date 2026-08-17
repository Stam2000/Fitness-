"use client";

import { useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  Loader2,
  RefreshCw,
  Trash2,
  UtensilsCrossed,
} from "lucide-react";
import Chip from "@/components/ui/Chip";
import IconButton from "@/components/ui/IconButton";
import MediaThumb from "@/components/ui/MediaThumb";
import { Button } from "@/components/ui/button";
import {
  openQuestions,
  totalsOf,
  type MealItemView,
  type MealView,
} from "@/lib/meals";

export type PortionChange = { grams: number } | { factor: number };

type MealCardProps = {
  meal: MealView;
  onAnswer: (itemId: string, included: boolean) => void;
  onPortion: (item: MealItemView, change: PortionChange) => void;
  onRetry: (mealId: string) => void;
  onDelete: (mealId: string) => void;
  retrying: boolean;
};

// Repli pour les portions que le modèle n'a pas su peser (« 1 bol », « une
// poignée ») : on corrige alors un ordre de grandeur, pas des grammes.
const FACTORS = [
  { label: "½", value: 0.5 },
  { label: "×1,5", value: 1.5 },
  { label: "×2", value: 2 },
];

export default function MealCard({
  meal,
  onAnswer,
  onPortion,
  onRetry,
  onDelete,
  retrying,
}: MealCardProps) {
  const [openDetail, setOpenDetail] = useState(false);

  const totals = totalsOf(meal.items);
  const pending = openQuestions(meal.items);
  const pendingKcal = pending.reduce((s, i) => s + i.kcal, 0);
  const detected = meal.items.filter((i) => i.kind !== "hypothesis");
  const questions = meal.items.filter((i) => i.kind === "hypothesis");
  const time = new Date(meal.eatenAtIso).toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <article className="card overflow-hidden">
      <div className="flex items-center gap-3 p-3">
        <MediaThumb
          url={meal.imageUrl}
          alt={meal.title ?? "Repas"}
          icon={UtensilsCrossed}
          iconSize={24}
          className="h-16 w-16 shrink-0 rounded-2xl"
        />
        <div className="min-w-0 flex-1">
          <p className="overline-label text-muted">{time}</p>
          <h3 className="truncate text-[15.5px] font-extrabold italic leading-snug">
            {meal.title ?? "Repas"}
          </h3>
          {meal.status === "ready" && (
            <p className="mt-0.5 font-mono text-[13px] font-bold text-accent">
              {Math.round(totals.kcal)} kcal
              <span className="ml-1.5 font-sans text-[11.5px] font-medium text-muted-2">
                {Math.round(totals.proteinG)} P · {Math.round(totals.carbsG)} G ·{" "}
                {Math.round(totals.fatG)} L
              </span>
            </p>
          )}
        </div>
        <IconButton
          aria-label="Supprimer le repas"
          variant="ghost"
          size="sm"
          onClick={() => {
            if (confirm("Supprimer ce repas ?")) onDelete(meal.id);
          }}
        >
          <Trash2 size={16} />
        </IconButton>
      </div>

      {meal.status === "pending" && (
        <div className="flex items-center gap-2 border-t border-card-border p-3 text-[13px] text-muted-2">
          <Loader2 size={15} className="animate-spin" /> Analyse en attente…
          <Button
            variant="tint"
            size="sm"
            onClick={() => onRetry(meal.id)}
            disabled={retrying}
            className="ml-auto"
          >
            Analyser
          </Button>
        </div>
      )}

      {meal.status === "failed" && (
        <div className="border-t border-card-border p-3">
          <p className="text-[12.5px] leading-relaxed text-danger">
            {meal.error ?? "Analyse impossible."}
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onRetry(meal.id)}
            disabled={retrying}
            className="mt-2"
          >
            {retrying ? (
              <>
                <Loader2 size={15} className="animate-spin" /> Analyse…
              </>
            ) : (
              <>
                <RefreshCw size={15} /> Relancer l&apos;analyse
              </>
            )}
          </Button>
        </div>
      )}

      {/* Le cœur de la fonctionnalité : ce que la photo ne peut pas montrer,
          posé en questions fermées. Répondre déplace le total aussitôt. */}
      {questions.length > 0 && (
        <section className="border-t border-card-border p-3">
          <h4 className="overline-label mb-2">
            L&apos;IA se demande
            {pending.length > 0 && (
              <span className="ml-1.5 font-mono normal-case tracking-normal text-warm">
                +{Math.round(pendingKcal)} kcal en attente
              </span>
            )}
          </h4>
          <ul className="flex flex-col gap-2.5">
            {questions.map((item) => (
              <li key={item.id} className="flex items-center gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-[13.5px] leading-snug">{item.question}</p>
                  <p className="text-[11.5px] text-muted">
                    {item.name}
                    {item.quantityLabel ? ` · ${item.quantityLabel}` : ""}
                    <span className="ml-1 font-mono text-warm">
                      +{Math.round(item.kcal)} kcal
                    </span>
                  </p>
                </div>
                <Chip
                  active={item.answered && item.included}
                  tone="accent"
                  onClick={() => onAnswer(item.id, true)}
                  className="min-h-[34px] px-3 text-[13px]"
                >
                  Oui
                </Chip>
                <Chip
                  active={item.answered && !item.included}
                  tone="warm"
                  onClick={() => onAnswer(item.id, false)}
                  className="min-h-[34px] px-3 text-[13px]"
                >
                  Non
                </Chip>
              </li>
            ))}
          </ul>
        </section>
      )}

      {detected.length > 0 && (
        <section className="border-t border-card-border">
          <button
            type="button"
            onClick={() => setOpenDetail((v) => !v)}
            className="flex w-full items-center gap-2 p-3 text-left"
          >
            <span className="overline-label flex-1">
              Détail · {detected.length} aliment{detected.length > 1 ? "s" : ""}
            </span>
            {openDetail ? (
              <ChevronUp size={16} className="text-muted" />
            ) : (
              <ChevronDown size={16} className="text-muted" />
            )}
          </button>

          {openDetail && (
            <ul className="flex flex-col gap-3 px-3 pb-3">
              {detected.map((item) => (
                <li key={item.id} className="flex flex-col gap-1.5">
                  <div className="flex items-center gap-2">
                    <label className="flex min-w-0 flex-1 items-center gap-2.5">
                      <input
                        type="checkbox"
                        checked={item.included}
                        onChange={(e) => onAnswer(item.id, e.target.checked)}
                        className="h-[18px] w-[18px] shrink-0 accent-accent"
                        aria-label={`Compter ${item.name}`}
                      />
                      <span className="min-w-0 flex-1">
                        <span
                          className={`block truncate text-[13.5px] ${item.included ? "" : "text-muted line-through"}`}
                        >
                          {item.name}
                        </span>
                        <span className="block text-[11.5px] text-muted">
                          {item.quantityLabel ?? "portion estimée"}
                        </span>
                      </span>
                    </label>
                    <span className="shrink-0 font-mono text-[13px] font-bold text-accent">
                      {Math.round(item.kcal)}
                    </span>
                  </div>
                  {/* Une portion mal estimée est l'autre grande source
                      d'erreur d'une analyse photo : la corriger recalcule les
                      apports au prorata. */}
                  <div className="flex items-center gap-1.5 pl-7">
                    <span className="text-[11px] text-muted">Portion</span>
                    {item.grams ? (
                      <>
                        <input
                          // Remonté quand le serveur renvoie une autre valeur
                          // (bornage) : sinon le champ garderait la saisie.
                          key={item.grams}
                          type="number"
                          inputMode="numeric"
                          min={1}
                          max={3000}
                          defaultValue={Math.round(item.grams)}
                          aria-label={`Portion de ${item.name} en grammes`}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") e.currentTarget.blur();
                          }}
                          onBlur={(e) => {
                            const grams = Number(e.target.value);
                            if (
                              !isFinite(grams) ||
                              grams <= 0 ||
                              Math.round(grams) === Math.round(item.grams ?? 0)
                            ) {
                              return;
                            }
                            onPortion(item, { grams });
                          }}
                          className="w-[62px] rounded-full border-[1.5px] border-border bg-surface-2 px-2.5 py-1 text-center font-mono text-[12px] text-ink focus:border-accent focus:outline-none"
                        />
                        <span className="text-[11px] text-muted">g</span>
                      </>
                    ) : (
                      FACTORS.map((f) => (
                        <Chip
                          key={f.label}
                          onClick={() => onPortion(item, { factor: f.value })}
                          className="min-h-[28px] px-2.5 text-[12px]"
                        >
                          {f.label}
                        </Chip>
                      ))
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {meal.comment && (
        <p className="border-t border-card-border p-3 text-[11.5px] leading-relaxed text-muted">
          {meal.comment}
        </p>
      )}
    </article>
  );
}
