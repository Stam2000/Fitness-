import Link from "next/link";
import { Camera, ChevronLeft, ChevronRight, UtensilsCrossed } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import FoodTable from "@/components/FoodTable";

export const dynamic = "force-dynamic";

// Quatre prises protéinées par jour : le découpage qui entretient le mieux la
// synthèse musculaire tout en restant tenable à table.
const MEALS_PER_DAY = 4;
// Repère par défaut tant qu'aucun objectif n'est fixé — une portion ronde et
// mémorisable, proche de ce que vise la plupart des plans.
const DEFAULT_MEAL_PROTEIN_G = 30;

export default async function FoodsPage() {
  const user = await requireUser();
  const goal = await prisma.nutritionGoal.findUnique({
    where: { userId: user.id },
  });

  const mealProteinG = goal?.dailyProteinG
    ? Math.max(5, Math.round(goal.dailyProteinG / MEALS_PER_DAY / 5) * 5)
    : DEFAULT_MEAL_PROTEIN_G;

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
          <UtensilsCrossed size={20} className="text-accent" /> Sources de
          protéines
        </h1>
        <p className="mt-1 text-[13.5px] leading-relaxed text-muted-2">
          {goal?.dailyProteinG
            ? `Ton objectif est de ${goal.dailyProteinG} g par jour, soit ~${mealProteinG} g par repas sur ${MEALS_PER_DAY} prises.`
            : `Aucun objectif fixé : les quantités sont calculées pour ${DEFAULT_MEAL_PROTEIN_G} g de protéines par repas.`}
        </p>
      </header>

      <section className="card flex flex-col gap-1.5 p-4 text-[12.5px] leading-relaxed text-muted">
        <h2 className="overline-label mb-0.5">Comment lire</h2>
        <p>
          <span className="font-mono font-bold text-accent">31 g</span> —
          protéines pour 100 g d&apos;aliment, dans l&apos;état indiqué à côté
          du nom (cuit, poids sec, égoutté…).
        </p>
        <p>
          <span className="font-mono font-bold text-accent">3,55 €</span> — prix
          de 100 g de protéines, et non prix au kilo : c&apos;est le seul
          chiffre comparable d&apos;un aliment à l&apos;autre. En{" "}
          <span className="font-semibold text-accent">vert</span> les
          économiques, en <span className="font-semibold text-warm">orange</span>{" "}
          ceux à garder pour le plaisir.
        </p>
        <p>
          <span className="font-mono font-semibold text-muted-2">97 g</span>{" "}
          pour {mealProteinG} g — la quantité à peser pour couvrir un repas.
        </p>
        <p className="text-muted">
          Prix indicatifs en supermarché, marques distributeur. Ils varient
          selon les pays et les promotions.
        </p>
      </section>

      <FoodTable mealProteinG={mealProteinG} />

      {/* Ce tableau dit quoi manger ; le journal dit ce qui a été mangé. */}
      <Link
        href="/body/meals"
        className="card flex items-center gap-2 p-4 text-[13px] font-semibold text-muted-2 hover:text-ink"
      >
        <Camera size={15} className="shrink-0 text-accent" />
        <span className="min-w-0 flex-1">
          Photographier un repas et compter les calories
        </span>
        <ChevronRight size={15} className="shrink-0" />
      </Link>
    </main>
  );
}
