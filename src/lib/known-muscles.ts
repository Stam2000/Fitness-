import { prisma } from "@/lib/prisma";
import { muscleComboKey, normalizeName } from "@/lib/normalize";
import { getSettings } from "@/lib/settings";
import {
  buildMuscleComboImagePrompt,
  buildMuscleImagePrompt,
  createImageTask,
} from "@/lib/kie";

// Groupe musculaire du catalogue (table Muscle) : liste seedée + ajouts
// créés par l'IA. Les exercices y font référence par nom, d'où l'importance
// que les chaînes écrites en base matchent Muscle.name exactement.
export type KnownMuscle = {
  id: string;
  name: string;
  imageUrl: string | null;
  imageTaskId: string | null;
};

export async function getKnownMuscles(): Promise<KnownMuscle[]> {
  return prisma.muscle.findMany({
    select: { id: true, name: true, imageUrl: true, imageTaskId: true },
    orderBy: { name: "asc" },
  });
}

// Bloc à injecter dans les prompts IA : liste fermée en priorité, niveau de
// détail anatomique exigé, création d'un nouveau muscle en dernier recours.
export function knownMusclesBlock(muscles: KnownMuscle[]): string {
  if (muscles.length === 0) return "";
  return `Pour "muscles", choisis EN PRIORITÉ dans cette liste, en recopiant le nom EXACTEMENT (accents, majuscules et parenthèses compris) : ${muscles
    .map((m) => m.name)
    .join(", ")}.
Vise le niveau de détail le PLUS PRÉCIS correspondant à l'exercice : "Pectoraux (haut)" pour un développé incliné, "Deltoïde postérieur" pour un oiseau, "Abdominaux (bas)" pour des relevés de jambes, "Grand dorsal" pour des tractions… Réserve les groupes généraux ("Pectoraux", "Dos", "Épaules", "Abdominaux", "Fessiers") aux exercices qui sollicitent tout le groupe de façon homogène.
Si aucun nom listé ne convient vraiment, tu peux introduire un nouveau muscle précis (nom court en français, ex. "Cou"). N'invente jamais de quasi-doublon d'un nom listé ("Epaules" alors que "Épaules" existe).`;
}

// Recolle chaque nom de muscle renvoyé par l'IA sur le nom canonique du
// catalogue (casse/accents près) et dédoublonne. Les noms inconnus restent
// tels quels : ce sont des muscles réellement nouveaux.
export function resolveMuscleNames(
  names: string[],
  known: KnownMuscle[]
): string[] {
  const byKey = new Map(known.map((m) => [normalizeName(m.name), m.name]));
  const seen = new Set<string>();
  const resolved: string[] = [];
  for (const raw of names) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    const key = normalizeName(trimmed);
    if (seen.has(key)) continue;
    seen.add(key);
    resolved.push(byKey.get(key) ?? trimmed);
  }
  return resolved;
}

type MuscledEntry = { muscles: string[] };

// Résout les muscles de tout un draft de programme (exercices et variantes
// de chaque jour), en place.
export function resolveDraftMuscles(
  draft: {
    days: { exercises: (MuscledEntry & { variations: MuscledEntry[] })[] }[];
  },
  known: KnownMuscle[]
): void {
  for (const day of draft.days) {
    for (const exercise of day.exercises) {
      exercise.muscles = resolveMuscleNames(exercise.muscles, known);
      for (const variation of exercise.variations) {
        variation.muscles = resolveMuscleNames(variation.muscles, known);
      }
    }
  }
}

// Crée en base les muscles encore inconnus (comparaison normalisée — l'index
// unique Postgres ne protège pas des doublons d'accents/casse), puis lance en
// arrière-plan la génération d'image des muscles créés si une clé Kie.ai est
// configurée. Jamais bloquant : un échec d'image n'empêche pas la sauvegarde.
export async function ensureMusclesExist(names: string[]): Promise<void> {
  const wanted = new Map<string, string>();
  for (const raw of names) {
    const trimmed = raw.trim();
    if (trimmed) wanted.set(normalizeName(trimmed), trimmed);
  }
  if (wanted.size === 0) return;

  const existing = await prisma.muscle.findMany({ select: { name: true } });
  const existingKeys = new Set(existing.map((m) => normalizeName(m.name)));

  const created: { id: string; name: string }[] = [];
  for (const [key, name] of wanted) {
    if (existingKeys.has(key)) continue;
    try {
      created.push(
        await prisma.muscle.create({
          data: { name },
          select: { id: true, name: true },
        })
      );
    } catch (e) {
      // P2002 : créé entre-temps par une requête concurrente — ignorer.
      if ((e as { code?: string })?.code !== "P2002") throw e;
    }
  }
  if (created.length === 0) return;

  const settings = await getSettings();
  if (!settings.kieApiKey) return;
  const apiKey = settings.kieApiKey;
  for (const muscle of created) {
    void createImageTask(buildMuscleImagePrompt(muscle.name), apiKey, "1:1")
      .then((taskId) =>
        prisma.muscle.update({
          where: { id: muscle.id },
          data: { imageTaskId: taskId },
        })
      )
      .catch((e) => {
        console.error(`image muscle « ${muscle.name} » :`, e);
      });
  }
}

// Combinaison de muscles du catalogue (table MuscleCombo).
export type KnownMuscleCombo = {
  id: string;
  key: string;
  muscles: string[];
  imageUrl: string | null;
  imageTaskId: string | null;
};

export async function getKnownMuscleCombos(): Promise<KnownMuscleCombo[]> {
  return prisma.muscleCombo.findMany({
    select: {
      id: true,
      key: true,
      muscles: true,
      imageUrl: true,
      imageTaskId: true,
    },
  });
}

// Crée en base les combinaisons de muscles (≥ 2 muscles distincts) encore
// inconnues, puis lance en arrière-plan la génération de leur illustration
// combinée si une clé Kie.ai est configurée. Une combinaison déjà en base
// (même clé, quel que soit l'ordre des muscles) est simplement réutilisée.
export async function ensureMuscleCombosExist(
  muscleSets: string[][]
): Promise<void> {
  const wanted = new Map<string, string[]>();
  for (const set of muscleSets) {
    const names = [...new Set(set.map((n) => n.trim()).filter(Boolean))];
    if (names.length < 2) continue;
    const key = muscleComboKey(names);
    if (!wanted.has(key)) wanted.set(key, names);
  }
  if (wanted.size === 0) return;

  const existing = await prisma.muscleCombo.findMany({
    where: { key: { in: [...wanted.keys()] } },
    select: { key: true },
  });
  const existingKeys = new Set(existing.map((c) => c.key));

  const created: { id: string; muscles: string[] }[] = [];
  for (const [key, muscles] of wanted) {
    if (existingKeys.has(key)) continue;
    try {
      created.push(
        await prisma.muscleCombo.create({
          data: { key, muscles },
          select: { id: true, muscles: true },
        })
      );
    } catch (e) {
      // P2002 : créée entre-temps par une requête concurrente — ignorer.
      if ((e as { code?: string })?.code !== "P2002") throw e;
    }
  }
  if (created.length === 0) return;

  const settings = await getSettings();
  if (!settings.kieApiKey) return;
  const apiKey = settings.kieApiKey;
  for (const combo of created) {
    void createImageTask(
      buildMuscleComboImagePrompt(combo.muscles),
      apiKey,
      "1:1"
    )
      .then((taskId) =>
        prisma.muscleCombo.update({
          where: { id: combo.id },
          data: { imageTaskId: taskId },
        })
      )
      .catch((e) => {
        console.error(`image combo « ${combo.muscles.join(" + ")} » :`, e);
      });
  }
}
