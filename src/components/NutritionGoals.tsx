"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Beef,
  Camera,
  ChevronRight,
  Loader2,
  Pencil,
  Target,
  Trash2,
  UtensilsCrossed,
  Weight,
  Zap,
} from "lucide-react";
import { deleteNutritionGoal, saveNutritionGoal } from "@/app/actions";
import { Button } from "@/components/ui/button";
import Chip from "@/components/ui/Chip";
import IconButton from "@/components/ui/IconButton";
import StatTile from "@/components/ui/StatTile";
import {
  ACTIVITIES,
  OBJECTIVES,
  completeMacros,
  computeTargets,
  findActivity,
  findObjective,
  maintenanceKcal,
  weeklyPace,
  weeksToTarget,
  type ActivityKey,
  type ObjectiveKey,
} from "@/lib/nutrition";

export type GoalView = {
  objective: string;
  activity: string;
  targetWeightKg: number | null;
  dailyCalories: number | null;
  dailyProteinG: number | null;
};

const inputClass =
  "w-full rounded-[18px] border-[1.5px] border-border bg-surface px-4 py-3 text-sm outline-none focus:border-accent";

const fmt = (n: number) => n.toLocaleString("fr-FR");
const fmt1 = (n: number) =>
  n.toLocaleString("fr-FR", { maximumFractionDigits: 1 });

export default function NutritionGoals({
  goal,
  currentWeightKg,
}: {
  goal: GoalView | null;
  // Poids de la dernière mesure enregistrée : base de tous les calculs.
  currentWeightKg: number | null;
}) {
  const [editing, setEditing] = useState(false);
  const [objective, setObjective] = useState<ObjectiveKey>(
    findObjective(goal?.objective).key
  );
  const [activity, setActivity] = useState<ActivityKey>(
    findActivity(goal?.activity).key
  );
  const [targetWeight, setTargetWeight] = useState(
    goal?.targetWeightKg?.toString() ?? ""
  );
  const [calories, setCalories] = useState(
    goal?.dailyCalories?.toString() ?? ""
  );
  const [protein, setProtein] = useState(goal?.dailyProteinG?.toString() ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const num = (s: string): number | null => {
    const v = parseFloat(s.replace(",", "."));
    return isFinite(v) ? v : null;
  };

  // Suggestion recalculée à chaque rendu : elle suit les puces sélectionnées
  // dans le formulaire, même avant enregistrement.
  const suggestion =
    currentWeightKg != null
      ? computeTargets(currentWeightKg, objective, activity)
      : null;

  // Changer d'objectif ou d'activité réécrit les deux cibles : c'est tout
  // l'intérêt du choix. Le poids visé, lui, n'est jamais déduit.
  function applySuggestion(next: {
    objective?: ObjectiveKey;
    activity?: ActivityKey;
  }) {
    const nextObjective = next.objective ?? objective;
    const nextActivity = next.activity ?? activity;
    setObjective(nextObjective);
    setActivity(nextActivity);
    if (currentWeightKg == null) return;
    const t = computeTargets(currentWeightKg, nextObjective, nextActivity);
    setCalories(String(t.calories));
    setProtein(String(t.proteinG));
  }

  function startEditing() {
    setError(null);
    // Première ouverture : partir de la suggestion plutôt que de champs vides.
    if (!goal && suggestion) {
      setCalories(String(suggestion.calories));
      setProtein(String(suggestion.proteinG));
    }
    setEditing(true);
  }

  function cancelEditing() {
    setObjective(findObjective(goal?.objective).key);
    setActivity(findActivity(goal?.activity).key);
    setTargetWeight(goal?.targetWeightKg?.toString() ?? "");
    setCalories(goal?.dailyCalories?.toString() ?? "");
    setProtein(goal?.dailyProteinG?.toString() ?? "");
    setError(null);
    setEditing(false);
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await saveNutritionGoal({
        objective,
        activity,
        targetWeightKg: num(targetWeight),
        dailyCalories: num(calories),
        dailyProteinG: num(protein),
      });
      setEditing(false);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Impossible d'enregistrer les objectifs."
      );
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!confirm("Supprimer les objectifs ?")) return;
    setSaving(true);
    setError(null);
    try {
      await deleteNutritionGoal();
      setTargetWeight("");
      setCalories("");
      setProtein("");
      setEditing(false);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Impossible de supprimer les objectifs."
      );
    } finally {
      setSaving(false);
    }
  }

  // — Récapitulatif de l'objectif enregistré —
  const saved = goal
    ? {
        objective: findObjective(goal.objective),
        activity: findActivity(goal.activity),
      }
    : null;
  const remainingKg =
    goal?.targetWeightKg != null && currentWeightKg != null
      ? Math.round((goal.targetWeightKg - currentWeightKg) * 10) / 10
      : null;
  const pace =
    goal?.dailyCalories != null && currentWeightKg != null
      ? weeklyPace(currentWeightKg, goal.activity, goal.dailyCalories)
      : null;
  const weeks =
    goal?.targetWeightKg != null && currentWeightKg != null && pace != null
      ? weeksToTarget(currentWeightKg, goal.targetWeightKg, pace)
      : null;
  const split =
    goal?.dailyCalories != null &&
    goal.dailyProteinG != null &&
    currentWeightKg != null
      ? completeMacros(
          currentWeightKg,
          goal.dailyCalories,
          goal.dailyProteinG,
          goal.objective
        )
      : null;

  return (
    <section className="card flex flex-col gap-3 p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="overline-label flex items-center gap-1.5">
          <UtensilsCrossed size={13} /> Objectifs nutrition
        </h2>
        {goal && !editing && (
          <IconButton
            onClick={startEditing}
            aria-label="Modifier les objectifs"
            variant="ghost"
            size="sm"
          >
            <Pencil size={15} />
          </IconButton>
        )}
      </div>

      {/* — Aucun objectif — */}
      {!goal && !editing && (
        <>
          <p className="text-[13px] leading-relaxed text-muted-2">
            {currentWeightKg != null ? (
              <>
                Calories et protéines calculées à partir de ton dernier poids (
                {fmt1(currentWeightKg)} kg) — ajustables à la main.
              </>
            ) : (
              <>
                Enregistre une première mesure de poids ci-dessous pour obtenir
                des cibles calculées ; tu peux aussi les saisir à la main.
              </>
            )}
          </p>
          <Button onClick={startEditing} variant="primary" size="md">
            <Target size={17} /> Définir mes objectifs
          </Button>
        </>
      )}

      {/* — Récapitulatif — */}
      {goal && !editing && saved && (
        <>
          <div className="grid grid-cols-3 gap-2">
            <StatTile
              value={
                goal.targetWeightKg != null ? (
                  <>
                    {fmt1(goal.targetWeightKg)}
                    <span className="text-[13px]"> kg</span>
                  </>
                ) : (
                  "—"
                )
              }
              label="Poids visé"
              hint={
                remainingKg != null && Math.abs(remainingKg) >= 0.1
                  ? `${fmt1(Math.abs(remainingKg))} kg à ${remainingKg > 0 ? "prendre" : "perdre"}`
                  : goal.targetWeightKg != null
                    ? "atteint"
                    : undefined
              }
            />
            <StatTile
              value={
                goal.dailyCalories != null ? (
                  <>
                    {fmt(goal.dailyCalories)}
                    <span className="text-[13px]"> kcal</span>
                  </>
                ) : (
                  "—"
                )
              }
              label="Par jour"
              hint={
                currentWeightKg != null
                  ? `maintenance ${fmt(maintenanceKcal(currentWeightKg, goal.activity))}`
                  : undefined
              }
            />
            <StatTile
              value={
                goal.dailyProteinG != null ? (
                  <>
                    {fmt(goal.dailyProteinG)}
                    <span className="text-[13px]"> g</span>
                  </>
                ) : (
                  "—"
                )
              }
              label="Protéines"
              hint={
                goal.dailyProteinG != null && currentWeightKg != null
                  ? `${fmt1(goal.dailyProteinG / currentWeightKg)} g/kg`
                  : undefined
              }
            />
          </div>

          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] text-muted">
            <span className="font-semibold text-muted-2">
              {saved.objective.label}
            </span>
            <span>·</span>
            <span>
              {saved.activity.label.toLowerCase()} ({saved.activity.hint})
            </span>
            {split && (
              <>
                <span>·</span>
                <span>
                  lipides ~{fmt(split.fatG)} g, glucides ~{fmt(split.carbsG)} g
                </span>
              </>
            )}
          </p>

          {pace != null && Math.abs(pace) >= 0.01 && (
            <p className="text-[12.5px] leading-relaxed text-muted">
              Rythme visé : {pace > 0 ? "+" : "−"}
              {fmt1(Math.abs(pace))} kg/semaine
              {weeks != null && ` — poids cible dans ~${weeks} semaines`}.
              {saved.objective.key === "recomp" &&
                " En recomposition la balance bouge peu : fie-toi au tour de taille, aux photos et à tes charges."}
            </p>
          )}
        </>
      )}

      {/* — Formulaire — */}
      {editing && (
        <>
          <div className="flex flex-col gap-1.5">
            <p className="text-xs font-semibold text-muted">Objectif</p>
            <div className="grid grid-cols-3 gap-2">
              {OBJECTIVES.map((o) => (
                <Chip
                  key={o.key}
                  active={objective === o.key}
                  onClick={() => applySuggestion({ objective: o.key })}
                >
                  {o.short}
                </Chip>
              ))}
            </div>
            <p className="text-[12px] leading-relaxed text-muted">
              {findObjective(objective).hint}
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <p className="text-xs font-semibold text-muted">
              Activité hebdomadaire
            </p>
            <div className="grid grid-cols-3 gap-2">
              {ACTIVITIES.map((a) => (
                <Chip
                  key={a.key}
                  active={activity === a.key}
                  onClick={() => applySuggestion({ activity: a.key })}
                >
                  {a.label}
                </Chip>
              ))}
            </div>
            <p className="text-[12px] leading-relaxed text-muted">
              {findActivity(activity).hint} par semaine — maintenance estimée à{" "}
              {findActivity(activity).kcalPerKg} kcal par kilo de poids.
            </p>
          </div>

          {suggestion ? (
            <p className="rounded-2xl bg-surface-2 px-3.5 py-2.5 text-[12.5px] leading-relaxed text-muted-2">
              Pour {fmt1(currentWeightKg!)} kg, maintenance estimée à{" "}
              <span className="font-mono font-bold text-accent">
                {fmt(suggestion.maintenanceKcal)}
              </span>{" "}
              kcal — soit{" "}
              <span className="font-mono font-bold text-accent">
                {fmt(suggestion.calories)}
              </span>{" "}
              kcal et{" "}
              <span className="font-mono font-bold text-accent">
                {fmt(suggestion.proteinG)}
              </span>{" "}
              g de protéines par jour (lipides ~{fmt(suggestion.fatG)} g,
              glucides ~{fmt(suggestion.carbsG)} g).
            </p>
          ) : (
            <p className="rounded-2xl bg-surface-2 px-3.5 py-2.5 text-[12.5px] leading-relaxed text-muted">
              Sans mesure de poids enregistrée, aucune valeur ne peut être
              calculée — saisis tes cibles à la main.
            </p>
          )}

          <div className="grid grid-cols-3 gap-2">
            <label className="flex flex-col gap-1 text-xs font-semibold text-muted">
              <span className="flex items-center gap-1">
                <Weight size={12} /> Poids visé
              </span>
              <input
                type="text"
                inputMode="decimal"
                value={targetWeight}
                onChange={(e) => setTargetWeight(e.target.value)}
                placeholder="88"
                className={inputClass}
              />
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold text-muted">
              <span className="flex items-center gap-1">
                <Zap size={12} /> kcal / jour
              </span>
              <input
                type="text"
                inputMode="numeric"
                value={calories}
                onChange={(e) => setCalories(e.target.value)}
                placeholder="2680"
                className={inputClass}
              />
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold text-muted">
              <span className="flex items-center gap-1">
                <Beef size={12} /> Protéines
              </span>
              <input
                type="text"
                inputMode="numeric"
                value={protein}
                onChange={(e) => setProtein(e.target.value)}
                placeholder="205"
                className={inputClass}
              />
            </label>
          </div>

          {error && <p className="text-sm text-danger">{error}</p>}

          <div className="flex items-center gap-2">
            <Button
              onClick={save}
              disabled={saving}
              variant="primary"
              size="md"
              className="flex-1"
            >
              {saving ? (
                <>
                  <Loader2 size={17} className="animate-spin" /> Enregistrement…
                </>
              ) : (
                <>
                  <Target size={17} /> Enregistrer
                </>
              )}
            </Button>
            <Button onClick={cancelEditing} disabled={saving} variant="outline" size="md">
              Annuler
            </Button>
            {goal && (
              <IconButton
                onClick={remove}
                disabled={saving}
                aria-label="Supprimer les objectifs"
                variant="danger"
                size="md"
              >
                <Trash2 size={17} />
              </IconButton>
            )}
          </div>
        </>
      )}

      {/* Le tableau des sources de protéines se règle sur la cible ci-dessus :
          il n'a de sens qu'à côté d'elle, d'où l'entrée depuis cette carte
          plutôt qu'un onglet de plus dans une barre déjà chargée. */}
      {/* La cible ci-dessus n'a de valeur que confrontée à ce qui est
          réellement mangé : le journal des repas se range donc ici, comme le
          tableau des sources, plutôt que dans une barre déjà chargée. */}
      {!editing && (
        <Link
          href="/body/meals"
          className="flex items-center gap-1.5 border-t border-border pt-3 text-[13px] font-semibold text-muted-2 hover:text-ink"
        >
          <Camera size={14} className="shrink-0" />
          <span className="min-w-0 flex-1">Repas du jour et calories</span>
          <ChevronRight size={15} className="shrink-0" />
        </Link>
      )}

      {!editing && (
        <Link
          href="/body/foods"
          className="-mb-1 flex items-center gap-1.5 border-t border-border pt-3 text-[13px] font-semibold text-muted-2 hover:text-ink"
        >
          <UtensilsCrossed size={14} className="shrink-0" />
          <span className="min-w-0 flex-1">Sources de protéines et prix</span>
          <ChevronRight size={15} className="shrink-0" />
        </Link>
      )}
    </section>
  );
}
