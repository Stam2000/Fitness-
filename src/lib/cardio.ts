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
