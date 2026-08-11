import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";

const MAX_BYTES = 10 * 1024 * 1024;

// Ligne CSV → cellules, avec gestion des guillemets (les exports Samsung
// Health peuvent contenir des champs texte quotés avec virgules).
function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        current += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        current += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      cells.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  cells.push(current);
  return cells;
}

// Index de colonne : les candidats sont essayés DANS L'ORDRE (le premier
// nom trouvé gagne — ex. "skeletal_muscle_mass", renseigné par la montre,
// doit primer sur "muscle_mass", souvent vide dans le même export).
function findColumn(header: string[], candidates: string[]): number {
  for (const candidate of candidates) {
    const i = header.indexOf(candidate);
    if (i !== -1) return i;
  }
  return -1;
}

function parseNumber(cell: string | undefined): number | null {
  if (!cell) return null;
  const v = parseFloat(cell.replace(",", "."));
  return isFinite(v) && v > 0 ? v : null;
}

// Importe un export Samsung Health (fichier com.samsung.health.weight.*.csv
// obtenu via « Télécharger les données personnelles ») : poids, masse
// musculaire squelettique et % de graisse, une mesure par jour. Le parseur
// est piloté par les en-têtes, donc tolérant aux variantes de format.
export async function POST(req: NextRequest) {
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!form || !(file instanceof File)) {
    return NextResponse.json({ error: "Fichier manquant" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: "Fichier trop lourd (10 Mo maximum)." },
      { status: 400 }
    );
  }

  const lines = (await file.text())
    .split(/\r?\n/)
    .filter((l) => l.trim().length > 0);

  // L'export Samsung commence par une ligne de métadonnées ; on cherche la
  // ligne d'en-têtes (celle qui contient une colonne de poids ou de date).
  let headerIndex = -1;
  let header: string[] = [];
  for (let i = 0; i < Math.min(lines.length, 5); i++) {
    const cells = parseCsvLine(lines[i]).map((c) => c.trim().toLowerCase());
    if (
      cells.includes("weight") ||
      cells.includes("start_time") ||
      cells.includes("poids")
    ) {
      headerIndex = i;
      header = cells;
      break;
    }
  }
  if (headerIndex === -1) {
    return NextResponse.json(
      {
        error:
          "En-têtes introuvables : attendu un export Samsung Health (com.samsung.health.weight.*.csv) ou un CSV avec colonnes start_time/weight.",
      },
      { status: 400 }
    );
  }

  const dateCol = findColumn(header, ["start_time", "create_time", "date"]);
  const weightCol = findColumn(header, ["weight", "weight_kg", "poids"]);
  const muscleCol = findColumn(header, [
    "skeletal_muscle_mass",
    "skeletal_muscle",
    "muscle_mass",
    "muscle",
  ]);
  const fatCol = findColumn(header, [
    "body_fat",
    "body_fat_percentage",
    "fat_percent",
    "graisse",
  ]);
  if (dateCol === -1 || weightCol === -1) {
    return NextResponse.json(
      { error: "Colonnes de date ou de poids introuvables dans le CSV." },
      { status: 400 }
    );
  }

  // Une mesure par jour : première ligne rencontrée pour chaque jour.
  const byDay = new Map<
    string,
    {
      date: Date;
      weightKg: number | null;
      muscleMassKg: number | null;
      bodyFatPct: number | null;
    }
  >();
  let invalid = 0;
  for (const line of lines.slice(headerIndex + 1)) {
    const cells = parseCsvLine(line);
    const rawDate = cells[dateCol]?.trim();
    const date = rawDate ? new Date(rawDate.replace(" ", "T")) : null;
    if (!date || isNaN(date.getTime())) {
      invalid++;
      continue;
    }
    const weightKg = parseNumber(cells[weightCol]);
    const muscleMassKg = muscleCol !== -1 ? parseNumber(cells[muscleCol]) : null;
    const bodyFatPct = fatCol !== -1 ? parseNumber(cells[fatCol]) : null;
    if (weightKg === null && muscleMassKg === null && bodyFatPct === null) {
      invalid++;
      continue;
    }
    if (
      (weightKg !== null && weightKg > 400) ||
      (muscleMassKg !== null && muscleMassKg > 200) ||
      (bodyFatPct !== null && bodyFatPct > 80)
    ) {
      invalid++;
      continue;
    }
    const day = date.toISOString().slice(0, 10);
    if (!byDay.has(day)) {
      byDay.set(day, { date, weightKg, muscleMassKg, bodyFatPct });
    }
  }

  if (byDay.size === 0) {
    return NextResponse.json(
      { error: "Aucune mesure exploitable dans ce fichier." },
      { status: 400 }
    );
  }

  // Ne pas dupliquer les jours déjà mesurés (saisie manuelle ou import passé).
  const existing = await prisma.bodyMeasurement.findMany({
    select: { date: true },
  });
  const existingDays = new Set(
    existing.map((m) => m.date.toISOString().slice(0, 10))
  );
  const toInsert = [...byDay.entries()]
    .filter(([day]) => !existingDays.has(day))
    .map(([, m]) => m);

  if (toInsert.length > 0) {
    await prisma.bodyMeasurement.createMany({ data: toInsert });
  }
  revalidatePath("/body");
  return NextResponse.json({
    imported: toInsert.length,
    skippedExisting: byDay.size - toInsert.length,
    skippedInvalid: invalid,
  });
}
