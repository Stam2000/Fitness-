// Catalogue de référence des aliments riches en protéines.
//
// Données statiques volontairement : ce sont des ordres de grandeur destinés à
// composer un repas, pas des mesures. Les mettre en base laisserait croire
// qu'elles se personnalisent, alors qu'elles ne bougent qu'avec une mise à
// jour du code.
//
// `costPer100gProtein` est le seul chiffre qui compte pour arbitrer le budget :
// le prix au kilo trompe (100 g de blanc de poulet et 100 g de lentilles sèches
// n'apportent pas la même chose). Prix indicatifs en supermarché européen,
// marques distributeur — ils bougent avec les promotions et les pays.
//
// Les valeurs nutritionnelles se rapportent à l'état indiqué par `state` :
// 100 g de lentilles sèches donnent environ 250 g une fois cuites.

export type CategoryKey =
  | "viandes"
  | "poissons"
  | "laitiers"
  | "vegetal"
  | "complements";

export type Food = {
  name: string;
  category: CategoryKey;
  /** État auquel se rapportent les valeurs : « cuit », « poids sec »… */
  state?: string;
  proteinPer100g: number;
  kcalPer100g: number;
  /** Coût approximatif de 100 g de protéines, en euros. */
  costPer100gProtein: number;
};

export type Category = {
  key: CategoryKey;
  label: string;
};

export const CATEGORIES: Category[] = [
  { key: "viandes", label: "Viandes" },
  { key: "poissons", label: "Poissons" },
  { key: "laitiers", label: "Œufs & laitiers" },
  { key: "vegetal", label: "Végétal" },
  { key: "complements", label: "Compléments" },
];

export const FOODS: Food[] = [
  // — Viandes —
  { name: "Foie de volaille", category: "viandes", state: "cuit", proteinPer100g: 25, kcalPer100g: 135, costPer100gProtein: 1.8 },
  { name: "Cuisses de poulet", category: "viandes", state: "cuites, sans peau", proteinPer100g: 25, kcalPer100g: 185, costPer100gProtein: 2.2 },
  { name: "Poulet entier", category: "viandes", state: "cuit", proteinPer100g: 25, kcalPer100g: 190, costPer100gProtein: 3.0 },
  { name: "Bœuf haché 5 %", category: "viandes", state: "cuit", proteinPer100g: 26, kcalPer100g: 175, costPer100gProtein: 3.1 },
  { name: "Filet de porc", category: "viandes", state: "cuit", proteinPer100g: 26, kcalPer100g: 165, costPer100gProtein: 3.2 },
  { name: "Jambon blanc dégraissé", category: "viandes", proteinPer100g: 21, kcalPer100g: 110, costPer100gProtein: 3.4 },
  { name: "Blanc de poulet", category: "viandes", state: "cuit", proteinPer100g: 31, kcalPer100g: 165, costPer100gProtein: 3.55 },
  { name: "Blanc de dinde", category: "viandes", state: "cuit", proteinPer100g: 29, kcalPer100g: 150, costPer100gProtein: 3.6 },
  { name: "Steak de bœuf", category: "viandes", state: "cuit", proteinPer100g: 27, kcalPer100g: 200, costPer100gProtein: 5.5 },

  // — Poissons & fruits de mer —
  { name: "Colin, lieu", category: "poissons", state: "surgelé, cuit", proteinPer100g: 23, kcalPer100g: 100, costPer100gProtein: 3.0 },
  { name: "Cabillaud", category: "poissons", state: "cuit", proteinPer100g: 23, kcalPer100g: 100, costPer100gProtein: 3.1 },
  { name: "Thon au naturel", category: "poissons", state: "boîte, égoutté", proteinPer100g: 26, kcalPer100g: 115, costPer100gProtein: 3.5 },
  { name: "Maquereau", category: "poissons", state: "boîte, égoutté", proteinPer100g: 24, kcalPer100g: 205, costPer100gProtein: 3.8 },
  { name: "Sardines", category: "poissons", state: "boîte, égouttées", proteinPer100g: 25, kcalPer100g: 210, costPer100gProtein: 4.0 },
  { name: "Saumon", category: "poissons", state: "cuit", proteinPer100g: 23, kcalPer100g: 210, costPer100gProtein: 7.8 },
  { name: "Crevettes", category: "poissons", state: "cuites", proteinPer100g: 24, kcalPer100g: 105, costPer100gProtein: 10.0 },

  // — Œufs & laitiers —
  { name: "Fromage blanc 0 %", category: "laitiers", state: "pot d'1 kg", proteinPer100g: 8, kcalPer100g: 47, costPer100gProtein: 2.75 },
  { name: "Skyr", category: "laitiers", proteinPer100g: 11, kcalPer100g: 60, costPer100gProtein: 3.2 },
  { name: "Lait demi-écrémé", category: "laitiers", proteinPer100g: 3.4, kcalPer100g: 46, costPer100gProtein: 3.2 },
  { name: "Œufs", category: "laitiers", state: "entiers, ~2 œufs", proteinPer100g: 13, kcalPer100g: 145, costPer100gProtein: 3.3 },
  { name: "Yaourt grec 0 %", category: "laitiers", proteinPer100g: 10, kcalPer100g: 60, costPer100gProtein: 3.3 },
  { name: "Emmental", category: "laitiers", proteinPer100g: 28, kcalPer100g: 370, costPer100gProtein: 3.6 },
  { name: "Parmesan", category: "laitiers", proteinPer100g: 33, kcalPer100g: 400, costPer100gProtein: 4.5 },
  { name: "Cottage cheese", category: "laitiers", state: "petits pots", proteinPer100g: 12, kcalPer100g: 90, costPer100gProtein: 5.0 },
  { name: "Blanc d'œuf", category: "laitiers", state: "en bouteille", proteinPer100g: 11, kcalPer100g: 50, costPer100gProtein: 5.0 },

  // — Végétal —
  { name: "Lentilles", category: "vegetal", state: "poids sec", proteinPer100g: 25, kcalPer100g: 350, costPer100gProtein: 1.0 },
  { name: "Pois chiches", category: "vegetal", state: "poids sec", proteinPer100g: 20, kcalPer100g: 365, costPer100gProtein: 1.1 },
  { name: "Haricots rouges", category: "vegetal", state: "poids sec", proteinPer100g: 22, kcalPer100g: 335, costPer100gProtein: 1.1 },
  { name: "Flocons d'avoine", category: "vegetal", state: "poids sec", proteinPer100g: 13, kcalPer100g: 380, costPer100gProtein: 1.15 },
  { name: "Cacahuètes", category: "vegetal", proteinPer100g: 26, kcalPer100g: 570, costPer100gProtein: 3.5 },
  { name: "Seitan", category: "vegetal", proteinPer100g: 25, kcalPer100g: 145, costPer100gProtein: 4.0 },
  { name: "Edamame", category: "vegetal", state: "écossés", proteinPer100g: 11, kcalPer100g: 120, costPer100gProtein: 4.5 },
  { name: "Graines de courge", category: "vegetal", proteinPer100g: 30, kcalPer100g: 560, costPer100gProtein: 5.5 },
  { name: "Amandes", category: "vegetal", proteinPer100g: 21, kcalPer100g: 580, costPer100gProtein: 5.7 },
  { name: "Tempeh", category: "vegetal", proteinPer100g: 19, kcalPer100g: 190, costPer100gProtein: 6.0 },
  { name: "Tofu ferme", category: "vegetal", proteinPer100g: 15, kcalPer100g: 145, costPer100gProtein: 6.7 },

  // — Compléments —
  { name: "Whey concentrée", category: "complements", state: "poudre, sac de 2,5 kg", proteinPer100g: 80, kcalPer100g: 400, costPer100gProtein: 2.5 },
  { name: "Whey isolate", category: "complements", state: "poudre", proteinPer100g: 90, kcalPer100g: 370, costPer100gProtein: 3.5 },
  { name: "Protéine végétale (pois)", category: "complements", state: "poudre", proteinPer100g: 80, kcalPer100g: 390, costPer100gProtein: 3.1 },
];

export type CostTier = "eco" | "moyen" | "cher";

/** Trois paliers de prix, pour colorer la colonne sans avoir à lire le chiffre. */
export function costTier(costPer100gProtein: number): CostTier {
  if (costPer100gProtein < 2.5) return "eco";
  if (costPer100gProtein <= 4) return "moyen";
  return "cher";
}

/**
 * Protéines pour 100 kcal : la mesure qui départage vraiment les aliments en
 * déficit calorique, où chaque calorie doit rapporter le plus possible.
 */
export function proteinDensity(food: Food): number {
  return (food.proteinPer100g / food.kcalPer100g) * 100;
}

/** Grammes d'aliment à peser pour obtenir la quantité de protéines visée. */
export function gramsForProtein(food: Food, targetProteinG: number): number {
  return Math.round((targetProteinG / food.proteinPer100g) * 100);
}
