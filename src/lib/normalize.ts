// Comparaison de noms insensible à la casse et aux accents. Module sans
// dépendance (surtout pas Prisma) : il est importé aussi bien côté serveur
// (resolvers IA) que côté client (lookup des muscles dans les composants).
export function normalizeName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

// Clé canonique d'une combinaison de muscles : noms normalisés, dédoublonnés,
// triés, joints par "|" — l'ordre des muscles sur l'exercice ne compte pas.
export function muscleComboKey(names: string[]): string {
  return [...new Set(names.map(normalizeName).filter(Boolean))]
    .sort()
    .join("|");
}
