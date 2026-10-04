/**
 * Estimation de la dépense énergétique sur tapis de course.
 *
 * Équations métaboliques de l'ACSM (American College of Sports Medicine),
 * qui donnent la consommation d'oxygène en ml/kg/min :
 *   marche  : VO2 = 0,1 × S + 1,8 × S × G + 3,5
 *   course  : VO2 = 0,2 × S + 0,9 × S × G + 3,5
 * avec S la vitesse en m/min et G la pente en fraction.
 *
 * L'équation de marche est validée jusqu'à ~6,4 km/h et celle de course à
 * partir de ~8 km/h : entre les deux on interpole pour éviter une marche
 * d'escalier dans le résultat.
 */

export const WALK_MAX_KMH = 6.4;
export const RUN_MIN_KMH = 8;
export const DEFAULT_WEIGHT_KG = 70;

export function vo2MlPerKgMin(speedKmh: number, inclinePct: number): number {
  const s = (speedKmh * 1000) / 60; // m/min
  const g = inclinePct / 100;
  const walking = 0.1 * s + 1.8 * s * g + 3.5;
  const running = 0.2 * s + 0.9 * s * g + 3.5;

  if (speedKmh <= WALK_MAX_KMH) return walking;
  if (speedKmh >= RUN_MIN_KMH) return running;
  const t = (speedKmh - WALK_MAX_KMH) / (RUN_MIN_KMH - WALK_MAX_KMH);
  return walking * (1 - t) + running * t;
}

export type CardioInput = {
  speedKmh: number;
  inclinePct: number;
  minutes: number;
  weightKg: number;
};

export type CardioEstimate = {
  calories: number;
  distanceKm: number;
  kcalPerMin: number;
  vo2: number;
  mets: number;
};

// 1 litre d'O2 consommé ≈ 5 kcal.
export function estimateCardio({
  speedKmh,
  inclinePct,
  minutes,
  weightKg,
}: CardioInput): CardioEstimate {
  const vo2 = vo2MlPerKgMin(speedKmh, inclinePct);
  const kcalPerMin = (vo2 * weightKg * 5) / 1000;
  return {
    calories: Math.round(kcalPerMin * minutes),
    distanceKm: (speedKmh * minutes) / 60,
    kcalPerMin,
    vo2,
    mets: vo2 / 3.5,
  };
}

export function formatDistance(km: number): string {
  return km >= 10 ? `${km.toFixed(1)} km` : `${km.toFixed(2)} km`;
}

export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return h > 0 ? `${h} h ${String(m).padStart(2, "0")}` : `${m} min`;
}

/**
 * Pas estimés pour une distance parcourue à une vitesse donnée.
 *
 * La longueur du pas grandit avec l'allure — ~0,67 m à 3 km/h, ~0,70 m à
 * 4 km/h, ~0,77 m à 6,4 km/h — soit 1 300 à 1 500 pas par kilomètre, ordre
 * de grandeur des tables de marche. C'est la valeur proposée à l'utilisateur
 * tant qu'il n'a pas lu le compteur du tapis ; sa saisie fait foi.
 */
export function estimateSteps(distanceKm: number, speedKmh: number): number {
  const strideM = 0.58 + 0.03 * speedKmh;
  if (distanceKm <= 0 || strideM <= 0) return 0;
  return Math.round((distanceKm * 1000) / strideM);
}

/** Jusqu'à 200 000 pas : au-delà d'une saisie, c'est une frappe parasite. */
export function clampSteps(steps: number): number {
  return Math.min(Math.max(Math.round(steps), 0), 200_000);
}

/**
 * Types de séance cardio (colonne `kind`). Le tapis connaît la vitesse et la
 * pente ; une marche dehors ne connaît que les pas lus sur le téléphone ou la
 * montre, et éventuellement la durée.
 */
export type CardioKind = "treadmill" | "walk";

export function cardioKindLabel(kind: string): string {
  return kind === "walk" ? "Marche extérieure" : "Tapis de course";
}

/** Allure de marche dehors supposée quand la durée est inconnue. */
export const DEFAULT_WALK_KMH = 4.8;
const WALK_FLOOR_KMH = 2.5;
const WALK_CEIL_KMH = 8;

function strideM(speedKmh: number): number {
  return 0.58 + 0.03 * speedKmh;
}

export type WalkInput = {
  steps: number;
  /** Null = durée inconnue : on suppose une allure de DEFAULT_WALK_KMH. */
  minutes: number | null;
  weightKg: number;
};

export type WalkEstimate = CardioEstimate & {
  speedKmh: number;
  /** Durée saisie, ou estimée depuis les pas à l'allure par défaut. */
  minutes: number;
};

/**
 * Dépense d'une marche connue par ses seuls pas.
 *
 * La longueur du pas dépend de l'allure (voir estimateSteps) : avec une durée,
 * la cadence fixe l'allure — distance d = n × (0,58 + 0,03 v) et v = d / t se
 * résolvent en d = 0,58 n / (1 − 0,0018 n / t), d en mètres et t en minutes.
 * 100 pas/min donnent ~4,2 km/h, 120 pas/min ~5,3 km/h. L'allure est bornée à
 * la plage de marche : une cadence trop basse signale des pauses, et seule la
 * durée effectivement marchée à l'allure plancher est comptée.
 *
 * Sans durée, on suppose une allure de 4,8 km/h. Le coût d'une marche dépend
 * surtout de la distance, donc l'erreur reste faible.
 */
export function estimateWalkFromSteps({
  steps,
  minutes,
  weightKg,
}: WalkInput): WalkEstimate {
  let speedKmh = DEFAULT_WALK_KMH;
  if (minutes != null && minutes > 0) {
    const denom = 1 - (0.0018 * steps) / minutes;
    const distanceM = denom > 0 ? (0.58 * steps) / denom : Infinity;
    speedKmh = (0.06 * distanceM) / minutes;
  }
  speedKmh = Math.min(Math.max(speedKmh, WALK_FLOOR_KMH), WALK_CEIL_KMH);

  const distanceKm = (steps * strideM(speedKmh)) / 1000;
  const walkedMinutes = (distanceKm / speedKmh) * 60;
  const activeMinutes =
    minutes != null && minutes > 0 ? Math.min(minutes, walkedMinutes) : walkedMinutes;

  const base = estimateCardio({
    speedKmh,
    inclinePct: 0,
    minutes: activeMinutes,
    weightKg,
  });
  return {
    ...base,
    distanceKm,
    speedKmh,
    minutes: minutes != null && minutes > 0 ? minutes : walkedMinutes,
  };
}
