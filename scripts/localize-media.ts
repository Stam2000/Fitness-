/**
 * Rapatrie en local tous les médias encore hébergés chez Kie.ai (leurs URLs
 * expirent au bout de quelques jours) : télécharge chaque fichier dans le
 * dossier persistant et remplace l'URL en base par « /api/media/… ».
 *
 *   npm run media:localize
 *
 * Idempotent : les URLs déjà locales sont ignorées ; une URL expirée (404)
 * est signalée mais laissée telle quelle (à régénérer via images:generate).
 */
import { PrismaClient } from "@prisma/client";
import { persistMediaUrl } from "../src/lib/media-store";

const prisma = new PrismaClient();

type Target = {
  label: string;
  field: "imageUrl" | "videoUrl";
  rows: { id: string; url: string }[];
  update: (id: string, url: string) => Promise<unknown>;
};

async function collectTargets(): Promise<Target[]> {
  const remote = { startsWith: "http" } as const;
  const [equipment, exercises, exerciseVideos, variations, variationVideos, muscles, combos] =
    await Promise.all([
      prisma.equipment.findMany({
        where: { imageUrl: remote },
        select: { id: true, imageUrl: true },
      }),
      prisma.exercise.findMany({
        where: { imageUrl: remote },
        select: { id: true, imageUrl: true },
      }),
      prisma.exercise.findMany({
        where: { videoUrl: remote },
        select: { id: true, videoUrl: true },
      }),
      prisma.exerciseVariation.findMany({
        where: { imageUrl: remote },
        select: { id: true, imageUrl: true },
      }),
      prisma.exerciseVariation.findMany({
        where: { videoUrl: remote },
        select: { id: true, videoUrl: true },
      }),
      prisma.muscle.findMany({
        where: { imageUrl: remote },
        select: { id: true, imageUrl: true },
      }),
      prisma.muscleCombo.findMany({
        where: { imageUrl: remote },
        select: { id: true, imageUrl: true },
      }),
    ]);

  return [
    {
      label: "équipements (image)",
      field: "imageUrl",
      rows: equipment.map((r) => ({ id: r.id, url: r.imageUrl! })),
      update: (id, url) =>
        prisma.equipment.update({ where: { id }, data: { imageUrl: url } }),
    },
    {
      label: "exercices (image)",
      field: "imageUrl",
      rows: exercises.map((r) => ({ id: r.id, url: r.imageUrl! })),
      update: (id, url) =>
        prisma.exercise.update({ where: { id }, data: { imageUrl: url } }),
    },
    {
      label: "exercices (vidéo)",
      field: "videoUrl",
      rows: exerciseVideos.map((r) => ({ id: r.id, url: r.videoUrl! })),
      update: (id, url) =>
        prisma.exercise.update({ where: { id }, data: { videoUrl: url } }),
    },
    {
      label: "variantes (image)",
      field: "imageUrl",
      rows: variations.map((r) => ({ id: r.id, url: r.imageUrl! })),
      update: (id, url) =>
        prisma.exerciseVariation.update({
          where: { id },
          data: { imageUrl: url },
        }),
    },
    {
      label: "variantes (vidéo)",
      field: "videoUrl",
      rows: variationVideos.map((r) => ({ id: r.id, url: r.videoUrl! })),
      update: (id, url) =>
        prisma.exerciseVariation.update({
          where: { id },
          data: { videoUrl: url },
        }),
    },
    {
      label: "muscles (image)",
      field: "imageUrl",
      rows: muscles.map((r) => ({ id: r.id, url: r.imageUrl! })),
      update: (id, url) =>
        prisma.muscle.update({ where: { id }, data: { imageUrl: url } }),
    },
    {
      label: "combinaisons (image)",
      field: "imageUrl",
      rows: combos.map((r) => ({ id: r.id, url: r.imageUrl! })),
      update: (id, url) =>
        prisma.muscleCombo.update({ where: { id }, data: { imageUrl: url } }),
    },
  ];
}

async function main() {
  const targets = await collectTargets();
  const total = targets.reduce((acc, t) => acc + t.rows.length, 0);
  if (total === 0) {
    console.log("Rien à rapatrier : tous les médias sont déjà locaux.");
    return;
  }
  console.log(`Rapatriement de ${total} média(s)…\n`);

  let ok = 0;
  let failed = 0;
  for (const target of targets) {
    if (target.rows.length === 0) continue;
    console.log(`${target.label} : ${target.rows.length}`);
    for (const row of target.rows) {
      const localUrl = await persistMediaUrl(row.url);
      if (localUrl === row.url) {
        failed += 1;
        console.log(`  ✗ ${row.url} — téléchargement impossible (expirée ?)`);
        continue;
      }
      await target.update(row.id, localUrl);
      ok += 1;
    }
  }

  console.log(`\nTerminé : ${ok}/${total} média(s) rapatrié(s).`);
  if (failed > 0) {
    console.log(
      `${failed} URL(s) inaccessibles — probablement expirées : régénère-les via « npm run images:generate » ou les boutons de l'app.`
    );
  }
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
