// Cibles nutritionnelles calculées à partir du poids de corps.
//
// La maintenance est estimée en kilocalories par kilo de poids plutôt que par
// une équation type Mifflin-St Jeor : celle-ci réclamerait taille, âge et sexe
// pour une précision que la variabilité individuelle (±15 % à profil égal)
// efface de toute façon. Ces valeurs sont un point de départ — c'est
// l'évolution réelle du poids sur deux à trois semaines qui les corrige.
//
// Module volontairement pur (aucun accès base ni session) : il est importé
// aussi bien par les Server Actions que par le formulaire côté client, qui
// recalcule la suggestion à chaque changement de sélection.

export type ObjectiveKey = "gain" | "recomp" | "cut";
export type ActivityKey = "low" | "moderate" | "high";

export type Objective = {
  key: ObjectiveKey;
  label: string;
  // Libellé court, pour les puces de sélection à trois colonnes.
  short: string;
  hint: string;
  // Écart quotidien appliqué à la maintenance (kcal, signé).
  kcalDelta: number;
  // Grammes par kilo de poids de corps.
  proteinPerKg: number;
  // Plancher lipidique, en grammes par kilo : sous ~0,8 g/kg la production
  // hormonale décroche, d'où un minimum même en déficit.
  fatPerKg: number;
};

export const OBJECTIVES: Objective[] = [
  {
    key: "gain",
    label: "Prise de masse",
    short: "Masse",
    hint: "Surplus modéré : construire du muscle en limitant le gras.",
    kcalDelta: 350,
    proteinPerKg: 1.8,
    fatPerKg: 1.2,
  },
  {
    key: "recomp",
    label: "Recomposition",
    short: "Recomp",
    hint: "Déficit léger : perdre du gras tout en gardant le muscle.",
    kcalDelta: -300,
    proteinPerKg: 2.2,
    fatPerKg: 1.0,
  },
  {
    key: "cut",
    label: "Sèche",
    short: "Sèche",
    hint: "Déficit marqué, protéines hautes pour protéger le muscle.",
    kcalDelta: -500,
    proteinPerKg: 2.4,
    fatPerKg: 0.9,
  },
];

export type Activity = {
  key: ActivityKey;
  label: string;
  hint: string;
  // Maintenance estimée, en kcal par kilo de poids de corps et par jour.
  kcalPerKg: number;
};

export const ACTIVITIES: Activity[] = [
  { key: "low", label: "Sédentaire", hint: "0 à 2 séances", kcalPerKg: 28 },
  { key: "moderate", label: "Modéré", hint: "3 à 4 séances", kcalPerKg: 32 },
  { key: "high", label: "Actif", hint: "5 séances et +", kcalPerKg: 36 },
];

// Déficit ou surplus cumulé correspondant à un kilo de poids de corps.
const KCAL_PER_KG = 7700;

export type NutritionTargets = {
  maintenanceKcal: number;
  calories: number;
  proteinG: number;
  fatG: number;
  carbsG: number;
  // Rythme théorique, en kg/semaine (positif = prise, négatif = perte).
  weeklyKgPace: number;
};

export function findObjective(key: string | null | undefined): Objective {
  return OBJECTIVES.find((o) => o.key === key) ?? OBJECTIVES[0];
}

export function findActivity(key: string | null | undefined): Activity {
  return ACTIVITIES.find((a) => a.key === key) ?? ACTIVITIES[1];
}

const roundTo = (v: number, step: number) => Math.round(v / step) * step;

/** Maintenance calorique estimée pour un poids et un niveau d'activité. */
export function maintenanceKcal(
  weightKg: number,
  activityKey: string | null | undefined
): number {
  return roundTo(weightKg * findActivity(activityKey).kcalPerKg, 10);
}

/**
 * Lipides et glucides déduits de cibles déjà fixées. Les glucides ne sont pas
 * un objectif en soi : ils absorbent le solde calorique une fois les protéines
 * posées et les lipides ramenés à leur plancher.
 */
export function completeMacros(
  weightKg: number,
  calories: number,
  proteinG: number,
  objectiveKey: string | null | undefined
): { fatG: number; carbsG: number } {
  const fatG = roundTo(weightKg * findObjective(objectiveKey).fatPerKg, 5);
  // 4 kcal/g pour les protéines et les glucides, 9 pour les lipides. Le
  // plancher à 0 ne sert qu'aux saisies manuelles aberrantes.
  const carbsG = Math.max(
    0,
    roundTo((calories - proteinG * 4 - fatG * 9) / 4, 5)
  );
  return { fatG, carbsG };
}

/**
 * Rythme théorique en kg/semaine pour une cible calorique donnée. Calculé à
 * partir des calories réellement visées — et non de la suggestion — pour que
 * l'estimation suive les ajustements manuels.
 */
export function weeklyPace(
  weightKg: number,
  activityKey: string | null | undefined,
  calories: number
): number {
  return ((calories - maintenanceKcal(weightKg, activityKey)) * 7) / KCAL_PER_KG;
}

/**
 * Cibles quotidiennes suggérées pour un poids, un objectif et un niveau
 * d'activité.
 */
export function computeTargets(
  weightKg: number,
  objectiveKey: string | null | undefined,
  activityKey: string | null | undefined
): NutritionTargets {
  const objective = findObjective(objectiveKey);
  const maintenance = maintenanceKcal(weightKg, activityKey);
  const calories = roundTo(maintenance + objective.kcalDelta, 10);
  const proteinG = roundTo(weightKg * objective.proteinPerKg, 5);
  const { fatG, carbsG } = completeMacros(
    weightKg,
    calories,
    proteinG,
    objective.key
  );

  return {
    maintenanceKcal: maintenance,
    calories,
    proteinG,
    fatG,
    carbsG,
    weeklyKgPace: weeklyPace(weightKg, activityKey, calories),
  };
}

/**
 * Nombre de semaines pour rejoindre le poids visé au rythme donné, ou null si
 * l'objectif est déjà atteint ou si le rythme s'en éloigne (p. ex. un surplus
 * calorique alors que le poids cible est inférieur au poids actuel).
 */
export function weeksToTarget(
  currentKg: number,
  targetKg: number,
  weeklyKgPace: number
): number | null {
  const remaining = targetKg - currentKg;
  if (Math.abs(remaining) < 0.5 || weeklyKgPace === 0) return null;
  if (Math.sign(remaining) !== Math.sign(weeklyKgPace)) return null;
  return Math.ceil(remaining / weeklyKgPace);
}
