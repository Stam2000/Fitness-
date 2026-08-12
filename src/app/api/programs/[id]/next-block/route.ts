import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSettings } from "@/lib/settings";
import { programDraftSchema } from "@/lib/program-schema";
import { knownExercisesBlock, PROGRAM_SYSTEM_PROMPT } from "@/lib/program-prompt";
import {
  getKnownExercises,
  knownExerciseLines,
  resolveKnownRefs,
} from "@/lib/known-exercises";
import {
  getKnownMuscles,
  knownMusclesBlock,
  resolveDraftMuscles,
} from "@/lib/known-muscles";
import { parseTopReps } from "@/lib/progress";
import { requireApiUser } from "@/lib/session";

function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("Pas de JSON dans la réponse");
  }
  return JSON.parse(candidate.slice(start, end + 1));
}

type SessionEntry = {
  topWeight: number | null;
  maxReps: number | null;
  doneCount: number;
  allAtTop: boolean;
};

// Résume les performances réelles du bloc, par mouvement réellement exécuté
// (variationName ?? nom de l'exercice), en lignes lisibles pour le prompt.
function describeBlockHistory(
  exercises: Map<
    string,
    { name: string; sets: number; reps: string; weightHint: string | null }
  >,
  sessions: {
    setLogs: {
      exerciseId: string;
      reps: number | null;
      weightKg: number | null;
      done: boolean;
      variationName: string | null;
    }[];
  }[]
): string {
  const byName = new Map<
    string,
    { target: { sets: number; reps: string }; perSession: SessionEntry[] }
  >();

  for (const session of sessions) {
    const grouped = new Map<
      string,
      { logs: typeof session.setLogs; target: { sets: number; reps: string } }
    >();
    for (const log of session.setLogs) {
      if (!log.done) continue;
      const ex = exercises.get(log.exerciseId);
      if (!ex) continue;
      const name = log.variationName ?? ex.name;
      const entry =
        grouped.get(name) ??
        { logs: [], target: { sets: ex.sets, reps: ex.reps } };
      entry.logs.push(log);
      grouped.set(name, entry);
    }
    for (const [name, { logs, target }] of grouped) {
      const agg = byName.get(name) ?? { target, perSession: [] };
      const weights = logs.filter((l) => l.weightKg != null);
      const top = parseTopReps(target.reps);
      agg.perSession.push({
        topWeight:
          weights.length > 0
            ? Math.max(...weights.map((l) => l.weightKg!))
            : null,
        maxReps: logs.reduce<number | null>(
          (acc, l) => (l.reps != null ? Math.max(acc ?? 0, l.reps) : acc),
          null
        ),
        doneCount: logs.length,
        allAtTop:
          top !== null &&
          logs.length >= target.sets &&
          logs.every((l) => l.reps != null && l.reps >= top),
      });
      byName.set(name, agg);
    }
  }

  return [...byName]
    .map(([name, { target, perSession }]) => {
      const n = perSession.length;
      const hits = perSession.filter((p) => p.allAtTop).length;
      const missed = perSession.reduce(
        (acc, p) => acc + Math.max(0, target.sets - p.doneCount),
        0
      );
      const weighted = perSession.filter((p) => p.topWeight != null);
      if (weighted.length > 0) {
        const first = weighted[0].topWeight!;
        const last = weighted[weighted.length - 1].topWeight!;
        const best = Math.max(...weighted.map((p) => p.topWeight!));
        return `- ${name} (objectif ${target.sets} × ${target.reps}) : ${n} séance(s), charge max ${first} → ${last} kg (record ${best} kg), haut de fourchette atteint ${hits}/${n} fois, ${missed} série(s) manquée(s)`;
      }
      const reps = perSession.map((p) => p.maxReps).filter((r) => r != null);
      const repsText =
        reps.length > 0
          ? `${reps[0]} → ${reps[reps.length - 1]} reps max`
          : "pas de reps enregistrées";
      return `- ${name} (objectif ${target.sets} × ${target.reps}, poids du corps) : ${n} séance(s), ${repsText}, haut de fourchette atteint ${hits}/${n} fois, ${missed} série(s) manquée(s)`;
    })
    .join("\n");
}

// Génère le BLOC SUIVANT d'un programme à partir des performances réelles du
// bloc courant. Renvoie un draft (programDraftSchema) SANS le sauvegarder :
// l'utilisateur relit et ajuste avant l'enregistrement (saveNextBlock).
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireApiUser();
  if (user instanceof NextResponse) return user;
  const { id } = await params;

  const settings = await getSettings();
  if (!settings.openrouterApiKey) {
    return NextResponse.json(
      { error: "Aucune clé OpenRouter configurée (Réglages)." },
      { status: 400 }
    );
  }

  const program = await prisma.program.findFirst({
    where: { id, userId: user.id },
    include: {
      location: { include: { equipment: { include: { equipment: true } } } },
      nextProgram: { select: { id: true } },
      days: {
        orderBy: { dayIndex: "asc" },
        include: {
          exercises: {
            orderBy: { order: "asc" },
            include: { variations: { orderBy: { order: "asc" } } },
          },
        },
      },
    },
  });
  if (!program) {
    return NextResponse.json(
      { error: "Programme introuvable" },
      { status: 404 }
    );
  }
  if (program.nextProgram) {
    return NextResponse.json(
      { error: "Ce bloc a déjà un bloc suivant." },
      { status: 400 }
    );
  }

  const [sessions, known, knownMuscles] = await Promise.all([
    prisma.workoutSession.findMany({
      where: {
        day: { programId: id },
        userId: user.id,
        completedAt: { not: null },
      },
      orderBy: { completedAt: "asc" },
      include: { setLogs: true },
    }),
    getKnownExercises(user.id),
    getKnownMuscles(),
  ]);
  const knownLines = knownExerciseLines(known);
  if (sessions.length === 0) {
    return NextResponse.json(
      { error: "Aucune séance terminée sur ce programme : rien à analyser." },
      { status: 400 }
    );
  }

  const exercisesById = new Map(
    program.days.flatMap((d) =>
      d.exercises.map((ex) => [
        ex.id,
        {
          name: ex.name,
          sets: ex.sets,
          reps: ex.reps,
          weightHint: ex.weightHint,
        },
      ])
    )
  );
  const history = describeBlockHistory(exercisesById, sessions);

  const equipmentNames =
    program.location?.equipment.map((e) => e.equipment.name) ?? [];
  const source = {
    name: program.name,
    description: program.description,
    days: program.days.map((d) => ({
      name: d.name,
      focus: d.focus,
      exercises: d.exercises.map((ex) => ({
        name: ex.name,
        sets: ex.sets,
        reps: ex.reps,
        restSeconds: ex.restSeconds,
        weightHint: ex.weightHint,
        equipment: ex.equipment,
        muscles: ex.muscles,
        targetSeconds: ex.targetSeconds,
        setSeconds: ex.setSeconds,
        transitionSeconds: ex.transitionSeconds,
        notes: ex.notes,
        variations: ex.variations.map((v) => ({
          name: v.name,
          sets: v.sets,
          reps: v.reps,
          restSeconds: v.restSeconds,
          weightHint: v.weightHint,
          equipment: v.equipment,
          muscles: v.muscles,
          targetSeconds: v.targetSeconds,
          setSeconds: v.setSeconds,
          notes: v.notes,
        })),
      })),
    })),
  };

  const userPrompt = `Voici le programme du bloc n°${program.blockNumber} qui vient de se terminer${program.blockCycles ? ` (${program.blockCycles} cycles prévus)` : ""}, et les performances réelles enregistrées.
Objectif : ${program.goal ?? "non précisé"} · Niveau : ${program.level ?? "non précisé"}.

Programme actuel :
${JSON.stringify(source, null, 2)}

Performances du bloc (par mouvement réellement exécuté) :
${history}
${knownLines.length > 0 ? `\n${knownExercisesBlock(knownLines)}\n` : ""}${knownMuscles.length > 0 ? `\n${knownMusclesBlock(knownMuscles)}\n` : ""}
Conçois le BLOC SUIVANT (bloc n°${program.blockNumber + 1}) :
- Même contexte et équipement disponible : ${equipmentNames.length > 0 ? equipmentNames.join(", ") : "aucun (poids du corps uniquement)"} — utilise EXCLUSIVEMENT cet équipement.
- Garde le même nombre de jours et la même logique de séance.
- Fais progresser chaque exercice selon ses performances réelles : haut de fourchette atteint régulièrement → nouvelle fourchette de reps ou variante plus difficile, et "weightHint" CONCRET en kg basé sur la dernière charge (ex. « démarre à 72,5 kg ») ; stagnation ou séries manquées → consolidation, travail technique, ou décharge (-10 % de charge).
- Garde EXACTEMENT le même nom quand un exercice continue tel quel : la continuité des courbes de progression et des suggestions de charge dépend du nom. Ne renomme que si tu remplaces réellement le mouvement.
- Si tu remplaces ou ajoutes un mouvement, pioche de préférence dans les exercices déjà connus listés plus haut (référence #n dans "name") avant d'en inventer un nouveau.
- Si l'ensemble du bloc montre des signes de fatigue (échecs répétés, beaucoup de séries manquées), conçois un bloc qui démarre par une décharge.
- Fixe "blockCycles" pour ce nouveau bloc (3 à 6 selon le niveau).
- Adapte "name" (ex. « ${program.name.replace(/ — Bloc \d+$/, "")} — Bloc ${program.blockNumber + 1} ») et "description" (ce qui change et pourquoi, en 1-2 phrases).
Réponds UNIQUEMENT avec l'objet JSON du programme, au format du schéma.`;

  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${settings.openrouterApiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://github.com/Stam2000/fitness-",
        "X-Title": "Mon Coach Fitness",
      },
      body: JSON.stringify({
        model: settings.openrouterModel,
        messages: [
          { role: "system", content: PROGRAM_SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.5,
      }),
    });
    if (!res.ok) {
      return NextResponse.json(
        { error: `Erreur OpenRouter (${res.status})` },
        { status: 502 }
      );
    }
    const json = await res.json();
    const content: string | undefined = json?.choices?.[0]?.message?.content;
    if (!content) {
      return NextResponse.json(
        { error: "Réponse vide du modèle." },
        { status: 502 }
      );
    }
    const draft = programDraftSchema.parse(extractJson(content));
    resolveKnownRefs(draft, known);
    resolveDraftMuscles(draft, knownMuscles);
    return NextResponse.json({ draft });
  } catch (e) {
    console.error("next-block:", e);
    return NextResponse.json(
      {
        error:
          "La génération du bloc suivant a échoué. Réessaie ou change de modèle dans Réglages.",
      },
      { status: 502 }
    );
  }
}
