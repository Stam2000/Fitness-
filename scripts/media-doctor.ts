/**
 * Diagnostic (et réparation) des images manquantes.
 *
 *   npm run media:doctor            # état des lieux, ne modifie rien
 *   npm run media:doctor -- --repair       # rapatrie les URLs distantes encore vivantes
 *   npm run media:doctor -- --repair --clear-dead   # + vide les URLs mortes
 *
 * Deux pannes possibles derrière une image cassée :
 *  1. l'URL pointe encore sur Kie.ai, dont les liens expirent en ~14 jours ;
 *  2. l'URL est locale (/api/media/…) mais le fichier a disparu — volume non
 *     persistant, typiquement un redéploiement sans « persistent storage ».
 * Le diagnostic les sépare, la réparation traite ce qui peut l'être.
 */
import { PrismaClient } from "@prisma/client";
import { access } from "fs/promises";
import { mediaFilePath, persistMediaUrl } from "../src/lib/media-store";

const prisma = new PrismaClient();
const args = process.argv.slice(2);
const repair = args.includes("--repair");
const clearDead = args.includes("--clear-dead");

type Row = { id: string; label: string; imageUrl: string | null };
type Verdict = "ok-local" | "missing-local" | "ok-remote" | "dead-remote" | "none";

type Target = {
  name: string;
  rows: () => Promise<Row[]>;
  update: (id: string, imageUrl: string | null) => Promise<unknown>;
};

const TARGETS: Target[] = [
  {
    name: "équipements",
    rows: async () =>
      (await prisma.equipment.findMany({ select: { id: true, name: true, imageUrl: true } }))
        .map((r) => ({ id: r.id, label: r.name, imageUrl: r.imageUrl })),
    update: (id, imageUrl) => prisma.equipment.update({ where: { id }, data: { imageUrl } }),
  },
  {
    name: "exercices",
    rows: async () =>
      (await prisma.exercise.findMany({ select: { id: true, name: true, imageUrl: true } }))
        .map((r) => ({ id: r.id, label: r.name, imageUrl: r.imageUrl })),
    update: (id, imageUrl) => prisma.exercise.update({ where: { id }, data: { imageUrl } }),
  },
  {
    name: "variantes",
    rows: async () =>
      (await prisma.exerciseVariation.findMany({ select: { id: true, name: true, imageUrl: true } }))
        .map((r) => ({ id: r.id, label: r.name, imageUrl: r.imageUrl })),
    update: (id, imageUrl) => prisma.exerciseVariation.update({ where: { id }, data: { imageUrl } }),
  },
  {
    name: "muscles",
    rows: async () =>
      (await prisma.muscle.findMany({ select: { id: true, name: true, imageUrl: true } }))
        .map((r) => ({ id: r.id, label: r.name, imageUrl: r.imageUrl })),
    update: (id, imageUrl) => prisma.muscle.update({ where: { id }, data: { imageUrl } }),
  },
  {
    name: "combos musculaires",
    rows: async () =>
      (await prisma.muscleCombo.findMany({ select: { id: true, key: true, imageUrl: true } }))
        .map((r) => ({ id: r.id, label: r.key, imageUrl: r.imageUrl })),
    update: (id, imageUrl) => prisma.muscleCombo.update({ where: { id }, data: { imageUrl } }),
  },
];

async function classify(url: string | null): Promise<Verdict> {
  if (!url) return "none";
  if (url.startsWith("/api/media/")) {
    const filePath = mediaFilePath(url.slice("/api/media/".length));
    if (!filePath) return "missing-local";
    try {
      await access(filePath);
      return "ok-local";
    } catch {
      return "missing-local";
    }
  }
  if (/^https?:\/\//i.test(url)) {
    try {
      const res = await fetch(url, { method: "HEAD" });
      return res.ok ? "ok-remote" : "dead-remote";
    } catch {
      return "dead-remote";
    }
  }
  return "missing-local";
}

async function main() {
  const totals: Record<Verdict, number> = {
    "ok-local": 0,
    "missing-local": 0,
    "ok-remote": 0,
    "dead-remote": 0,
    none: 0,
  };
  let repaired = 0;
  let cleared = 0;

  for (const target of TARGETS) {
    const rows = await target.rows();
    const counts: Record<Verdict, number> = {
      "ok-local": 0,
      "missing-local": 0,
      "ok-remote": 0,
      "dead-remote": 0,
      none: 0,
    };

    for (const row of rows) {
      const verdict = await classify(row.imageUrl);
      counts[verdict] += 1;
      totals[verdict] += 1;

      if (repair && verdict === "ok-remote" && row.imageUrl) {
        const local = await persistMediaUrl(row.imageUrl);
        if (local.startsWith("/api/media/")) {
          await target.update(row.id, local);
          repaired += 1;
        }
      }
      if (clearDead && (verdict === "dead-remote" || verdict === "missing-local")) {
        await target.update(row.id, null);
        cleared += 1;
      }
    }

    const withUrl = rows.length - counts.none;
    console.log(
      `${target.name.padEnd(20)} ${withUrl}/${rows.length} avec image — ` +
        `✓ locales ${counts["ok-local"]} · ✗ fichier absent ${counts["missing-local"]} · ` +
        `↗ distantes vivantes ${counts["ok-remote"]} · ✗ distantes expirées ${counts["dead-remote"]}`
    );
  }

  console.log("\n──────── Diagnostic ────────");
  if (totals["ok-remote"] + totals["dead-remote"] > 0) {
    console.log(
      `⚠ ${totals["ok-remote"] + totals["dead-remote"]} image(s) pointent encore sur une URL Kie.ai.`
    );
    console.log(
      "  Ces liens expirent en ~14 jours : c'est la cause la plus fréquente d'images"
    );
    console.log("  qui disparaissent d'un coup après avoir fonctionné.");
    if (totals["ok-remote"] > 0 && !repair) {
      console.log(
        `  → ${totals["ok-remote"]} encore accessible(s) : relance avec --repair pour les rapatrier maintenant.`
      );
    }
  }
  if (totals["missing-local"] > 0) {
    console.log(
      `⚠ ${totals["missing-local"]} image(s) locales dont le fichier a disparu du disque.`
    );
    console.log(
      "  Le dossier des médias n'est pas persistant : monte un volume sur /app/data/media"
    );
    console.log(
      "  (docker compose le fait ; sous Coolify, déclare un « Persistent Storage »)."
    );
  }
  if (totals["dead-remote"] + totals["missing-local"] > 0 && !clearDead) {
    console.log(
      `\n→ ${totals["dead-remote"] + totals["missing-local"]} image(s) irrécupérable(s).` +
        " Relance avec --repair --clear-dead pour vider ces liens,"
    );
    console.log(
      "  puis régénère-les avec « npm run images:generate »."
    );
  }
  if (totals["ok-local"] > 0) {
    console.log(`✓ ${totals["ok-local"]} image(s) locales en bon état.`);
  }
  if (repaired > 0) console.log(`\n✓ ${repaired} image(s) rapatriée(s) en local.`);
  if (cleared > 0) console.log(`✓ ${cleared} lien(s) mort(s) vidé(s).`);
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
