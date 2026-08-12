import { prisma } from "@/lib/prisma";
import { normalizeName } from "@/lib/normalize";

// Mouvement unique déjà en base, avec sa référence courte (#n) présentée à
// l'IA. La référence n'est stable que le temps d'une requête : la liste est
// régénérée (même tri) à chaque appel, et la résolution se fait dans la même
// requête que la génération.
export type KnownExercise = {
  ref: number;
  name: string;
  muscles: string[];
  equipment: string[];
  practiced: boolean;
};

// Inventaire des mouvements uniques déjà en base (exercices et variantes de
// tous les programmes), dédoublonnés par nom normalisé. Sert de contexte aux
// prompts IA pour qu'un même mouvement garde EXACTEMENT le même nom d'un
// programme à l'autre (l'historique de charge et les records sont retrouvés
// par nom). « déjà pratiqué » = au moins une série cochée en séance.
// Restreint aux programmes du compte : l'inventaire nourrit les prompts IA,
// il ne doit pas y faire entrer les mouvements inventés par d'autres.
export async function getKnownExercises(
  userId: string,
  limit = 120
): Promise<KnownExercise[]> {
  const [exercises, variations, logs] = await Promise.all([
    prisma.exercise.findMany({
      where: { day: { program: { userId } } },
      select: { name: true, muscles: true, equipment: true },
    }),
    prisma.exerciseVariation.findMany({
      where: { exercise: { day: { program: { userId } } } },
      select: { name: true, muscles: true, equipment: true },
    }),
    prisma.setLog.findMany({
      where: { done: true, session: { userId } },
      select: { variationName: true, exercise: { select: { name: true } } },
    }),
  ]);

  const practiced = new Set(
    logs.map((l) => normalizeName(l.variationName ?? l.exercise.name))
  );

  type Entry = Omit<KnownExercise, "ref"> & { count: number };
  const byKey = new Map<string, Entry>();
  for (const { name, muscles, equipment } of [...exercises, ...variations]) {
    const key = normalizeName(name);
    if (!key) continue;
    const entry = byKey.get(key);
    if (entry) {
      entry.count += 1;
      if (entry.muscles.length === 0) entry.muscles = muscles;
      if (entry.equipment.length === 0) entry.equipment = equipment;
    } else {
      byKey.set(key, {
        name: name.trim(),
        muscles,
        equipment,
        count: 1,
        practiced: practiced.has(key),
      });
    }
  }

  return [...byKey.values()]
    .sort(
      (a, b) =>
        Number(b.practiced) - Number(a.practiced) ||
        b.count - a.count ||
        a.name.localeCompare(b.name, "fr")
    )
    .slice(0, limit)
    .map((e, i) => ({
      ref: i + 1,
      name: e.name,
      muscles: e.muscles,
      equipment: e.equipment,
      practiced: e.practiced,
    }));
}

// Lignes prêtes pour le prompt : « #12 Développé couché haltères (Pectoraux) ».
export function knownExerciseLines(known: KnownExercise[]): string[] {
  return known.map(
    (e) =>
      `#${e.ref} ${e.name}${e.muscles.length > 0 ? ` (${e.muscles.join(", ")})` : ""}${
        e.practiced ? " — déjà pratiqué" : ""
      }`
  );
}

// Retrouve l'exercice connu désigné par un nom renvoyé par l'IA : référence
// « #12 » (ou « 12 », ou « #12 Nom recopié »), sinon nom identique à la
// casse/accents près. null = mouvement réellement nouveau.
function matchKnown(
  name: string,
  known: KnownExercise[]
): KnownExercise | null {
  const trimmed = name.trim();
  const refMatch = trimmed.match(/^#?(\d+)\s*$/) ?? trimmed.match(/^#(\d+)\b/);
  if (refMatch) {
    return known.find((k) => k.ref === Number(refMatch[1])) ?? null;
  }
  const key = normalizeName(trimmed);
  return known.find((k) => normalizeName(k.name) === key) ?? null;
}

type NamedEntry = { name: string; muscles: string[]; equipment: string[] };

// Remplace en place une référence (ou un quasi-doublon de nom) par le nom
// canonique du catalogue ; complète muscles/équipement s'ils manquent.
function resolveEntry(entry: NamedEntry, known: KnownExercise[]): void {
  const match = matchKnown(entry.name, known);
  if (!match) return;
  entry.name = match.name;
  if (entry.muscles.length === 0) entry.muscles = [...match.muscles];
  if (entry.equipment.length === 0) entry.equipment = [...match.equipment];
}

// Résout toutes les références d'un draft de programme (exercices et
// variantes de chaque jour), en place.
export function resolveKnownRefs(
  draft: { days: { exercises: (NamedEntry & { variations: NamedEntry[] })[] }[] },
  known: KnownExercise[]
): void {
  for (const day of draft.days) {
    for (const exercise of day.exercises) {
      resolveEntry(exercise, known);
      for (const variation of exercise.variations) {
        resolveEntry(variation, known);
      }
    }
  }
}

// Variante mono-exercice (substitution).
export function resolveKnownRef(
  entry: NamedEntry,
  known: KnownExercise[]
): void {
  resolveEntry(entry, known);
}
