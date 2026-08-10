// Résolution de la variante active d'un exercice pour une séance donnée :
// rotation automatique par n° de passage, surchargée par le choix manuel
// persisté sur la séance, avec clamp si les variantes ont changé entre-temps.

export function parseVariationChoices(raw: unknown): Record<string, number> {
  return raw && typeof raw === "object" && !Array.isArray(raw)
    ? (raw as Record<string, number>)
    : {};
}

export function activeVariationIndex(
  session: { cycleIndex: number; variationChoices: unknown },
  exercise: { id: string; variations: unknown[] }
): number {
  const optionCount = 1 + exercise.variations.length;
  const choices = parseVariationChoices(session.variationChoices);
  const auto = optionCount > 1 ? session.cycleIndex % optionCount : 0;
  return Math.min(choices[exercise.id] ?? auto, optionCount - 1);
}
