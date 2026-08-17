import Link from "next/link";
import { ChevronLeft, UtensilsCrossed } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { getSettings } from "@/lib/settings";
import { completeMacros } from "@/lib/nutrition";
import {
  dayRange,
  isIsoDay,
  toIsoDay,
  toMealView,
  type DayTargets,
} from "@/lib/meals";
import MealDay from "@/components/meals/MealDay";

export const dynamic = "force-dynamic";

export default async function MealsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const requested = typeof params.jour === "string" ? params.jour : null;
  const todayKey = toIsoDay(new Date());
  const dayKey = isIsoDay(requested) ? requested : todayKey;
  const { start, end } = dayRange(dayKey);

  const [meals, goal, measurement, settings] = await Promise.all([
    prisma.meal.findMany({
      where: { userId: user.id, eatenAt: { gte: start, lt: end } },
      orderBy: { eatenAt: "asc" },
      include: { items: { orderBy: { order: "asc" } } },
    }),
    prisma.nutritionGoal.findUnique({ where: { userId: user.id } }),
    prisma.bodyMeasurement.findFirst({
      where: { userId: user.id, weightKg: { not: null } },
      orderBy: { date: "desc" },
    }),
    getSettings(),
  ]);

  // NutritionGoal ne stocke que calories et protéines : glucides et lipides
  // se déduisent du même calcul que la carte d'objectifs, pour que les deux
  // écrans ne racontent pas deux histoires différentes.
  const weightKg = measurement?.weightKg ?? null;
  const split =
    goal?.dailyCalories != null && goal.dailyProteinG != null && weightKg != null
      ? completeMacros(
          weightKg,
          goal.dailyCalories,
          goal.dailyProteinG,
          goal.objective
        )
      : null;
  const targets: DayTargets = {
    kcal: goal?.dailyCalories ?? null,
    proteinG: goal?.dailyProteinG ?? null,
    carbsG: split?.carbsG ?? null,
    fatG: split?.fatG ?? null,
  };

  return (
    <main className="flex flex-col gap-4 pb-6">
      <header className="pt-2">
        <Link
          href="/body"
          className="inline-flex items-center gap-1 text-sm text-muted hover:text-ink"
        >
          <ChevronLeft size={16} /> Suivi corporel
        </Link>
        <h1 className="mt-1 flex items-center gap-2 text-[21px] font-extrabold italic leading-tight tracking-tight">
          <UtensilsCrossed size={20} className="text-accent" /> Repas
        </h1>
        <p className="mt-1 text-[13.5px] leading-relaxed text-muted-2">
          Photographie ton assiette : l&apos;estimation se corrige en répondant
          aux questions de l&apos;IA.
        </p>
      </header>

      <MealDay
        dayKey={dayKey}
        todayKey={todayKey}
        meals={meals.map(toMealView)}
        targets={targets}
        hasAiKey={Boolean(settings.openrouterApiKey)}
      />
    </main>
  );
}
