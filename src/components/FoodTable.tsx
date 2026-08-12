"use client";

import { useState } from "react";
import {
  Drumstick,
  Egg,
  Fish,
  Milk,
  Sprout,
  type LucideIcon,
} from "lucide-react";
import Chip from "@/components/ui/Chip";
import {
  CATEGORIES,
  FOODS,
  costTier,
  gramsForProtein,
  proteinDensity,
  type CategoryKey,
  type CostTier,
  type Food,
} from "@/lib/foods";

const CATEGORY_ICONS: Record<CategoryKey, LucideIcon> = {
  viandes: Drumstick,
  poissons: Fish,
  laitiers: Egg,
  vegetal: Sprout,
  complements: Milk,
};

// Le prix est le critère par défaut : c'est celui qui tranche au moment de
// remplir le caddie, les valeurs nutritionnelles se ressemblant beaucoup à
// l'intérieur d'une même catégorie.
const SORTS = [
  {
    key: "cost",
    label: "Prix",
    compare: (a: Food, b: Food) => a.costPer100gProtein - b.costPer100gProtein,
  },
  {
    key: "density",
    label: "Densité",
    compare: (a: Food, b: Food) => proteinDensity(b) - proteinDensity(a),
  },
  {
    key: "protein",
    label: "Protéines",
    compare: (a: Food, b: Food) => b.proteinPer100g - a.proteinPer100g,
  },
] as const;

type SortKey = (typeof SORTS)[number]["key"];

const TIER_CLASS: Record<CostTier, string> = {
  eco: "text-accent",
  moyen: "text-muted-2",
  cher: "text-warm",
};

const euro = (n: number) =>
  n.toLocaleString("fr-FR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
const grams = (n: number) =>
  n.toLocaleString("fr-FR", { maximumFractionDigits: 1 });

export default function FoodTable({
  mealProteinG,
}: {
  // Protéines visées par repas : sert à convertir chaque aliment en grammes à
  // peser, seul chiffre directement actionnable quand on compose une assiette.
  mealProteinG: number;
}) {
  const [category, setCategory] = useState<CategoryKey | "all">("all");
  const [sort, setSort] = useState<SortKey>("cost");

  const compare = SORTS.find((s) => s.key === sort)!.compare;
  const visible = FOODS.filter(
    (f) => category === "all" || f.category === category
  );
  // Vue « Tout » : on garde le regroupement par catégorie demandé, le tri
  // s'appliquant à l'intérieur de chaque groupe. Une catégorie précise donne
  // au contraire une liste à plat, le classement étant alors la seule question.
  const groups =
    category === "all"
      ? CATEGORIES.map((c) => ({
          category: c,
          foods: visible
            .filter((f) => f.category === c.key)
            .sort(compare),
        })).filter((g) => g.foods.length > 0)
      : [
          {
            category: CATEGORIES.find((c) => c.key === category)!,
            foods: [...visible].sort(compare),
          },
        ];

  return (
    <div className="flex flex-col gap-4">
      <section className="card flex flex-col gap-3 p-4">
        <div className="flex flex-col gap-1.5">
          <p className="text-xs font-semibold text-muted">Catégorie</p>
          <div className="flex flex-wrap gap-2">
            <Chip active={category === "all"} onClick={() => setCategory("all")}>
              Tout
            </Chip>
            {CATEGORIES.map((c) => (
              <Chip
                key={c.key}
                active={category === c.key}
                onClick={() => setCategory(c.key)}
              >
                {c.label}
              </Chip>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <p className="text-xs font-semibold text-muted">Classer par</p>
          <div className="grid grid-cols-3 gap-2">
            {SORTS.map((s) => (
              <Chip
                key={s.key}
                active={sort === s.key}
                onClick={() => setSort(s.key)}
              >
                {s.label}
              </Chip>
            ))}
          </div>
          <p className="text-[12px] leading-relaxed text-muted">
            {sort === "cost"
              ? "Du moins cher au plus cher, à quantité de protéines égale."
              : sort === "density"
                ? "Le plus de protéines par calorie — le critère qui compte en déficit."
                : "La teneur brute en protéines pour 100 g d'aliment."}
          </p>
        </div>
      </section>

      {groups.map((group) => {
        const Icon = CATEGORY_ICONS[group.category.key];
        return (
          <section key={group.category.key} className="card p-4">
            <h2 className="overline-label mb-1 flex items-center gap-1.5">
              <Icon size={13} /> {group.category.label}
            </h2>
            <ul className="flex flex-col divide-y divide-border">
              {group.foods.map((food) => {
                const tier = costTier(food.costPer100gProtein);
                return (
                  <li
                    key={food.name}
                    className="flex items-start gap-3 py-2.5"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-[14.5px] font-bold leading-tight">
                        {food.name}
                        {food.state && (
                          <span className="font-medium text-muted">
                            {" "}
                            · {food.state}
                          </span>
                        )}
                      </p>
                      <p className="mt-0.5 text-[11.5px] leading-tight text-muted">
                        {food.kcalPer100g} kcal ·{" "}
                        {Math.round(proteinDensity(food))} g/100 kcal ·{" "}
                        <span className="font-mono font-semibold text-muted-2">
                          {gramsForProtein(food, mealProteinG)} g
                        </span>{" "}
                        pour {mealProteinG} g
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="font-mono text-[15px] font-bold leading-tight text-accent">
                        {grams(food.proteinPer100g)} g
                      </p>
                      <p
                        className={`font-mono text-[11.5px] font-semibold leading-tight ${TIER_CLASS[tier]}`}
                      >
                        {euro(food.costPer100gProtein)} €
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
