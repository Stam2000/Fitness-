// Analyseur local des performances dictées pendant la séance. Sert de repli
// quand aucun modèle vocal n'est configuré (ou qu'il échoue) : voir
// /api/voice/parse pour l'interprétation par le modèle.

// Une série dictée : position 1-based (null = non précisée), poids, reps.
export type VoiceSet = {
  set: number | null;
  weightKg: number | null;
  reps: number | null;
};

const ORDINALS: Record<string, number> = {
  premiere: 1,
  première: 1,
  deuxieme: 2,
  deuxième: 2,
  seconde: 2,
  troisieme: 3,
  troisième: 3,
  quatrieme: 4,
  quatrième: 4,
  cinquieme: 5,
  cinquième: 5,
  sixieme: 6,
  sixième: 6,
};

// Normalise une dictée : « virgule » devient un point décimal, les virgules
// littérales séparent les séries — sauf « 62,5 » (demi-kilo sur une charge).
function normalizeVoiceText(transcript: string): string {
  return transcript
    .toLowerCase()
    .replace(/\s*virgule\s*/g, ".")
    .replace(/\b(\d{2,3}),(\d)\b/g, "$1.$2")
    .replace(/,/g, ";");
}

// Position explicite dans un segment : « série 2 », « la deuxième série ».
function segmentSetNumber(segment: string): number | null {
  const numbered = segment.match(/s[ée]rie\s*(?:n[°o]\s*)?(\d+)/);
  if (numbered) return parseInt(numbered[1], 10);
  const digit = segment.match(/\b(\d+)\s*(?:er|ère|ere|ème|eme|e)\s*s[ée]rie/);
  if (digit) return parseInt(digit[1], 10);
  for (const [word, value] of Object.entries(ORDINALS)) {
    if (segment.includes(`${word} série`) || segment.includes(`${word} serie`)) {
      return value;
    }
  }
  return null;
}

// « 80 kilos 10 répétitions », « 10 reps à 82,5 kg », « 12 fois 20 kilos »…
export function parseVoiceEntry(transcript: string): {
  weightKg: number | null;
  reps: number | null;
} {
  const text = transcript
    .toLowerCase()
    .replace(/,/g, ".")
    .replace(/virgule/g, ".");

  let weightKg: number | null = null;
  let reps: number | null = null;

  const weightMatch = text.match(/(\d+(?:\.\d+)?)\s*(?:kilos?|kg)/);
  if (weightMatch) weightKg = parseFloat(weightMatch[1]);

  const repsMatch = text.match(/(\d+)\s*(?:reps?|rép(?:é|e)titions?|fois)/);
  if (repsMatch) reps = parseInt(repsMatch[1], 10);

  if (weightKg === null || reps === null) {
    const numbers = (text.match(/\d+(?:\.\d+)?/g) ?? [])
      .map(Number)
      .filter((n) => n !== weightKg && n !== reps);
    if (weightKg === null && reps === null) {
      if (numbers.length >= 2) {
        // Sans unités : le plus grand nombre est le poids.
        const [a, b] = numbers;
        weightKg = Math.max(a, b);
        reps = Math.min(a, b);
      } else if (numbers.length === 1) {
        reps = Math.round(numbers[0]);
      }
    } else if (weightKg === null && numbers.length > 0) {
      weightKg = numbers[0];
    } else if (reps === null && numbers.length > 0) {
      reps = Math.round(numbers[0]);
    }
  }

  return { weightKg, reps };
}

// Découpe la dictée en séries. « puis » et « ensuite » séparent toujours ;
// la virgule seulement devant un nombre nu (« 12, 10, 9, 8 ») ou un marqueur
// de série — sinon « 62 kilos, 11 répétitions » compterait pour deux séries.
function splitSegments(text: string): string[] {
  const segments: string[] = [];
  for (const part of text.split(/\s*(?:\bpuis\b|\bensuite\b)\s*/)) {
    const pieces = part
      .split(";")
      .map((p) => p.trim())
      .filter(Boolean);
    pieces.forEach((chunk, i) => {
      const standalone =
        i === 0 ||
        segments.length === 0 ||
        /^\d+(?:\.\d+)?$/.test(chunk) ||
        segmentSetNumber(chunk) !== null;
      if (standalone) segments.push(chunk);
      else segments[segments.length - 1] += ` ${chunk}`;
    });
  }
  return segments;
}

// Interprète une dictée en une ou plusieurs séries, et reconnaît
// « toutes les séries à X ».
export function parseVoiceEntries(transcript: string): {
  sets: VoiceSet[];
  allSets: boolean;
} {
  const text = normalizeVoiceText(transcript);
  const segments = splitSegments(text);

  const sets: VoiceSet[] = [];
  let lastWeight: number | null = null;
  for (const segment of segments) {
    const marker = segmentSetNumber(segment);
    // Le marqueur de position ne doit pas être confondu avec une valeur.
    const cleaned = segment
      .replace(/s[ée]ries?\s*(?:n[°o]\s*)?\d+/g, " ")
      .replace(/\b\d+\s*(?:er|ère|ere|ème|eme|e)\s*s[ée]ries?/g, " ");
    const { weightKg, reps } = parseVoiceEntry(cleaned);
    if (weightKg === null && reps === null) continue;
    if (weightKg !== null) lastWeight = weightKg;
    sets.push({
      set: marker !== null && marker <= 20 ? marker : null,
      // Un poids annoncé une fois vaut pour les séries suivantes.
      weightKg: weightKg ?? lastWeight,
      reps,
    });
  }

  const allSets =
    sets.length === 1 &&
    /toutes? (?:les|mes) s[ée]ries|chaque s[ée]rie/.test(text);
  return { sets, allSets };
}
