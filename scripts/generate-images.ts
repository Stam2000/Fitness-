/**
 * Génère avec Kie.ai (GPT Image 2) toutes les images manquantes :
 * équipements et exercices.
 *
 *   npm run images:generate                 # tout ce qui manque
 *   npm run images:generate -- --equipment  # équipements uniquement
 *   npm run images:generate -- --exercises  # exercices uniquement
 *   npm run images:generate -- --force      # régénère aussi celles déjà là
 *
 * La clé est lue depuis les Réglages (base) ou KIE_API_KEY.
 */
import { PrismaClient } from "@prisma/client";
import {
  buildEquipmentImagePrompt,
  buildExerciseImagePrompt,
  createImageTask,
  getImageTaskResult,
} from "../src/lib/kie";

const prisma = new PrismaClient();

const args = process.argv.slice(2);
const force = args.includes("--force");
const onlyEquipment = args.includes("--equipment");
const onlyExercises = args.includes("--exercises");
const doEquipment = onlyEquipment || !onlyExercises;
const doExercises = onlyExercises || !onlyEquipment;

const CONCURRENCY = 3;
const POLL_INTERVAL_MS = 5000;
const POLL_TIMEOUT_MS = 5 * 60 * 1000;

type Job = {
  kind: "equipment" | "exercise";
  id: string;
  label: string;
  prompt: string;
  aspect: "1:1" | "3:2";
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function resolveApiKey(): Promise<string> {
  const settings = await prisma.settings.findUnique({ where: { id: 1 } });
  const key = settings?.kieApiKey || process.env.KIE_API_KEY;
  if (!key) {
    throw new Error(
      "Aucune clé Kie.ai : renseigne KIE_API_KEY dans .env ou la clé dans Réglages."
    );
  }
  return key;
}

async function runJob(job: Job, apiKey: string): Promise<boolean> {
  try {
    const taskId = await createImageTask(job.prompt, apiKey, job.aspect);
    const deadline = Date.now() + POLL_TIMEOUT_MS;
    while (Date.now() < deadline) {
      await sleep(POLL_INTERVAL_MS);
      const result = await getImageTaskResult(taskId, apiKey);
      if (result.state === "success" && result.url) {
        if (job.kind === "equipment") {
          await prisma.equipment.update({
            where: { id: job.id },
            data: { imageUrl: result.url, imageTaskId: null },
          });
        } else {
          await prisma.exercise.update({
            where: { id: job.id },
            data: { imageUrl: result.url, imageTaskId: null },
          });
        }
        console.log(`  ✓ ${job.label}`);
        return true;
      }
      if (result.state === "fail") {
        console.log(`  ✗ ${job.label} — ${result.error ?? "échec"}`);
        return false;
      }
    }
    console.log(`  ✗ ${job.label} — délai dépassé`);
    return false;
  } catch (e) {
    console.log(
      `  ✗ ${job.label} — ${e instanceof Error ? e.message : "erreur"}`
    );
    return false;
  }
}

async function main() {
  const apiKey = await resolveApiKey();
  const jobs: Job[] = [];

  if (doEquipment) {
    const equipment = await prisma.equipment.findMany({
      where: force ? {} : { imageUrl: null },
      orderBy: [{ category: "asc" }, { name: "asc" }],
    });
    for (const eq of equipment) {
      jobs.push({
        kind: "equipment",
        id: eq.id,
        label: `[équipement] ${eq.name}`,
        prompt: buildEquipmentImagePrompt(eq.name, eq.category),
        aspect: "1:1",
      });
    }
  }

  if (doExercises) {
    const exercises = await prisma.exercise.findMany({
      where: force ? {} : { imageUrl: null },
      orderBy: { name: "asc" },
    });
    // Un seul rendu par nom d'exercice, réutilisé sur les doublons.
    const seen = new Set<string>();
    for (const ex of exercises) {
      if (seen.has(ex.name)) continue;
      seen.add(ex.name);
      jobs.push({
        kind: "exercise",
        id: ex.id,
        label: `[exercice] ${ex.name}`,
        prompt: buildExerciseImagePrompt(ex.name, ex.equipment),
        aspect: "3:2",
      });
    }
  }

  if (jobs.length === 0) {
    console.log("Rien à générer : toutes les images sont déjà présentes.");
    return;
  }

  console.log(
    `Génération de ${jobs.length} image(s) avec GPT Image 2 (${CONCURRENCY} en parallèle)…\n`
  );

  let done = 0;
  let ok = 0;
  const queue = [...jobs];
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
      for (;;) {
        const job = queue.shift();
        if (!job) return;
        const success = await runJob(job, apiKey);
        done += 1;
        if (success) ok += 1;
        console.log(`  … ${done}/${jobs.length}`);
      }
    })
  );

  // Les images d'exercices sont partagées entre exercices de même nom.
  if (doExercises) {
    const withImage = await prisma.exercise.findMany({
      where: { imageUrl: { not: null } },
      select: { name: true, imageUrl: true },
    });
    const byName = new Map(withImage.map((e) => [e.name, e.imageUrl!]));
    for (const [name, url] of byName) {
      await prisma.exercise.updateMany({
        where: { name, imageUrl: null },
        data: { imageUrl: url },
      });
    }
  }

  console.log(`\nTerminé : ${ok}/${jobs.length} image(s) générée(s).`);
  if (ok < jobs.length) {
    console.log("Relance la commande pour réessayer les images manquantes.");
  }
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
