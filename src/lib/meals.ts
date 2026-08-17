// Arithmétique du journal des repas.
//
// Module volontairement pur (aucun accès base ni session), sur le modèle de
// src/lib/nutrition.ts : il est importé aussi bien par les routes et Server
// Actions que par les composants clients, qui recalculent le total à chaque
// réponse donnée sans aller-retour serveur. C'est ce qui rend l'ajustement
// instantané.
//
// Les totaux ne sont jamais stockés : ils se somment depuis les lignes
// retenues. Un total et le détail qui le justifie ne peuvent donc pas
// diverger.

export type MealItemKind = "detected" | "hypothesis" | "manual";
export type MealStatus = "pending" | "ready" | "failed";

export type MacroTotals = {
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
};

export const EMPTY_TOTALS: MacroTotals = {
  kcal: 0,
  proteinG: 0,
  carbsG: 0,
  fatG: 0,
};

// Vue sérialisable d'une ligne : ce que le serveur envoie au client (dates
// déjà résolues en booléen, pas d'objet Date à traverser la frontière).
export type MealItemView = MacroTotals & {
  id: string;
  name: string;
  quantityLabel: string | null;
  grams: number | null;
  kind: MealItemKind;
  question: string | null;
  included: boolean;
  /** L'utilisateur a tranché — accepté OU refusé. */
  answered: boolean;
};

export type MealView = {
  id: string;
  eatenAtIso: string;
  imageUrl: string | null;
  title: string | null;
  note: string | null;
  comment: string | null;
  status: MealStatus;
  error: string | null;
  items: MealItemView[];
};

export type DayTargets = {
  kcal: number | null;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
};

// ---------------------------------------------------------------------------
// Sérialisation
// ---------------------------------------------------------------------------

// Formes structurelles plutôt que les types Prisma : ce module reste pur et
// importable côté client, où @prisma/client n'a rien à faire.
type MealItemRow = {
  id: string;
  name: string;
  quantityLabel: string | null;
  grams: number | null;
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  kind: string;
  question: string | null;
  included: boolean;
  answeredAt: Date | null;
};

type MealRow = {
  id: string;
  eatenAt: Date;
  imageUrl: string | null;
  title: string | null;
  note: string | null;
  comment: string | null;
  status: string;
  error: string | null;
  items: MealItemRow[];
};

/** Ligne Prisma → vue client (dates résolues, aucun objet Date à traverser). */
export function toMealView(meal: MealRow): MealView {
  return {
    id: meal.id,
    eatenAtIso: meal.eatenAt.toISOString(),
    imageUrl: meal.imageUrl,
    title: meal.title,
    note: meal.note,
    comment: meal.comment,
    status: (meal.status as MealStatus) ?? "pending",
    error: meal.error,
    items: meal.items.map((i) => ({
      id: i.id,
      name: i.name,
      quantityLabel: i.quantityLabel,
      grams: i.grams,
      kcal: i.kcal,
      proteinG: i.proteinG,
      carbsG: i.carbsG,
      fatG: i.fatG,
      kind: (i.kind as MealItemKind) ?? "detected",
      question: i.question,
      included: i.included,
      answered: i.answeredAt != null,
    })),
  };
}

// ---------------------------------------------------------------------------
// Totaux
// ---------------------------------------------------------------------------

function add(a: MacroTotals, b: MacroTotals): MacroTotals {
  return {
    kcal: a.kcal + b.kcal,
    proteinG: a.proteinG + b.proteinG,
    carbsG: a.carbsG + b.carbsG,
    fatG: a.fatG + b.fatG,
  };
}

/**
 * Somme des lignes retenues. C'est LE total affiché : retenir une hypothèse
 * ou écarter un aliment mal vu passe par cette seule fonction, d'où le
 * recalcul immédiat à l'écran.
 */
export function totalsOf(items: MealItemView[]): MacroTotals {
  return items.reduce<MacroTotals>(
    (acc, item) => (item.included ? add(acc, item) : acc),
    EMPTY_TOTALS
  );
}

/** Total d'une journée = somme de ses repas. */
export function dayTotals(meals: { items: MealItemView[] }[]): MacroTotals {
  return meals.reduce<MacroTotals>(
    (acc, meal) => add(acc, totalsOf(meal.items)),
    EMPTY_TOTALS
  );
}

/** Hypothèses encore sans réponse : la part d'incertitude assumée. */
export function openQuestions(items: MealItemView[]): MealItemView[] {
  return items.filter((i) => i.kind === "hypothesis" && !i.answered);
}

/**
 * Borne haute : lignes retenues + hypothèses sans réponse. Permet d'annoncer
 * « 640 kcal, jusqu'à 960 si tu réponds oui » plutôt que de faire passer un
 * minimum connu pour un total arrêté.
 */
export function upperTotals(items: MealItemView[]): MacroTotals {
  return openQuestions(items).reduce<MacroTotals>(
    (acc, item) => add(acc, item),
    totalsOf(items)
  );
}

/** Idem sur une journée entière. */
export function dayUpperTotals(
  meals: { items: MealItemView[] }[]
): MacroTotals {
  return meals.reduce<MacroTotals>(
    (acc, meal) => add(acc, upperTotals(meal.items)),
    EMPTY_TOTALS
  );
}

/** Pourcentage borné 0–100 pour les barres de progression. */
export function progressPct(value: number, target: number | null): number {
  if (!target || target <= 0) return 0;
  return Math.min(100, Math.max(0, (value / target) * 100));
}

// ---------------------------------------------------------------------------
// Cohérence des valeurs venues du modèle
// ---------------------------------------------------------------------------

/** 4 kcal/g pour protéines et glucides, 9 pour les lipides. */
export function kcalFromMacros(
  proteinG: number,
  carbsG: number,
  fatG: number
): number {
  return proteinG * 4 + carbsG * 4 + fatG * 9;
}

/**
 * Calories retenues pour une ligne.
 *
 * Le modèle annonce des kcal ET des macros, et se trompe régulièrement sur
 * l'arithmétique qui les relie. Hors d'une bande de tolérance, on refait le
 * calcul depuis les macros : c'est l'estimation réellement fondée, les
 * calories n'en étant qu'une conséquence.
 *
 * Bande haute large (1,6×) parce que le triplet P/G/L ne décrit pas tout —
 * l'alcool apporte 7 kcal/g sans être aucun des trois. Sous 25 kcal dérivées
 * (café, épices, boisson alcoolisée), les macros ne disent rien d'utile : on
 * garde la valeur du modèle, simplement bornée.
 */
export function reconcileKcal(
  kcal: number,
  proteinG: number,
  carbsG: number,
  fatG: number
): number {
  const derived = kcalFromMacros(proteinG, carbsG, fatG);
  if (derived < 25) return clamp(Math.round(kcal), 0, 400);
  const plausible = kcal >= derived * 0.7 && kcal <= derived * 1.6;
  return Math.round(plausible ? kcal : derived);
}

function clamp(v: number, min: number, max: number): number {
  if (!isFinite(v)) return min;
  return Math.min(max, Math.max(min, v));
}

// Une décimale pour les macros : au-delà, on affiche du bruit.
function round1(v: number): number {
  return Math.round(v * 10) / 10;
}

export type RawItemMacros = {
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  grams: number | null;
};

/**
 * Bornage et arrondis d'une ligne venue du modèle. Une sortie de LLM est une
 * donnée non fiable : 1 200 g de poulet ou 900 g de protéines arrivent assez
 * souvent pour qu'on les coupe ici plutôt qu'à l'affichage.
 */
export function clampItemMacros(raw: RawItemMacros): RawItemMacros {
  const proteinG = round1(clamp(raw.proteinG, 0, 300));
  const carbsG = round1(clamp(raw.carbsG, 0, 500));
  const fatG = round1(clamp(raw.fatG, 0, 300));
  return {
    proteinG,
    carbsG,
    fatG,
    kcal: clamp(reconcileKcal(raw.kcal, proteinG, carbsG, fatG), 0, 3000),
    grams:
      raw.grams == null ? null : Math.round(clamp(raw.grams, 0, 3000)) || null,
  };
}

// ---------------------------------------------------------------------------
// Correction de portion
// ---------------------------------------------------------------------------

/**
 * Remet une ligne à l'échelle d'un facteur. Une portion mal estimée est la
 * première source d'erreur d'une analyse photo : corriger la quantité doit
 * corriger les calories dans la même proportion.
 */
export function scaleItemBy<T extends RawItemMacros>(item: T, factor: number): T {
  if (!isFinite(factor) || factor < 0) return item;
  return {
    ...item,
    kcal: Math.round(clamp(item.kcal * factor, 0, 3000)),
    proteinG: round1(clamp(item.proteinG * factor, 0, 300)),
    carbsG: round1(clamp(item.carbsG * factor, 0, 500)),
    fatG: round1(clamp(item.fatG * factor, 0, 300)),
    grams: item.grams == null ? null : Math.round(clamp(item.grams * factor, 0, 3000)),
  };
}

/**
 * Remet une ligne à l'échelle d'une nouvelle masse. Sans masse de référence
 * (« 1 bol », « une poignée »), le prorata n'a pas de base : l'appelant passe
 * alors par scaleItemBy avec un multiplicateur.
 */
export function scaleItemToGrams<T extends RawItemMacros>(
  item: T,
  newGrams: number
): T {
  if (!item.grams || item.grams <= 0 || !isFinite(newGrams) || newGrams < 0) {
    return item;
  }
  return { ...scaleItemBy(item, newGrams / item.grams), grams: Math.round(newGrams) };
}

// ---------------------------------------------------------------------------
// Jours
// ---------------------------------------------------------------------------

/**
 * Bornes d'une journée locale, pour les requêtes Prisma (`gte` / `lt`).
 *
 * Le jour est interprété dans le fuseau du serveur (TZ=Europe/Paris dans
 * docker-compose), même convention que dateKey() dans src/lib/activity.ts :
 * un repas de 23 h reste au jour où il a été mangé, ce qu'un découpage UTC
 * déplacerait au lendemain.
 */
export function dayRange(isoDay: string): { start: Date; end: Date } {
  const [y, m, d] = isoDay.split("-").map(Number);
  const start = new Date(y, (m || 1) - 1, d || 1, 0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end };
}

/** Jour local d'une date, au format « AAAA-MM-JJ ». */
export function toIsoDay(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Décale un jour de n jours (navigation veille / lendemain). */
export function shiftIsoDay(isoDay: string, days: number): string {
  const { start } = dayRange(isoDay);
  start.setDate(start.getDate() + days);
  return toIsoDay(start);
}

/** « AAAA-MM-JJ » valide ? Sinon l'appelant retombe sur aujourd'hui. */
export function isIsoDay(value: string | null | undefined): value is string {
  return (
    !!value && /^\d{4}-\d{2}-\d{2}$/.test(value) && !isNaN(Date.parse(value))
  );
}

/** Libellé « lundi 17 août », ou « Aujourd'hui » / « Hier ». */
export function formatDayLabel(isoDay: string, todayIso: string): string {
  if (isoDay === todayIso) return "Aujourd'hui";
  if (isoDay === shiftIsoDay(todayIso, -1)) return "Hier";
  const { start } = dayRange(isoDay);
  return start.toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}
