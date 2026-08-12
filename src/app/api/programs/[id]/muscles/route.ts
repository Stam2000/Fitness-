import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSettings } from "@/lib/settings";
import {
  ensureMuscleCombosExist,
  ensureMusclesExist,
  getKnownMuscles,
  knownMusclesBlock,
  resolveMuscleNames,
} from "@/lib/known-muscles";
import { requireApiUser } from "@/lib/session";

// Réponse attendue du modèle : muscles + temps cible (et transition pour les
// exercices de base) de chaque mouvement.
const responseSchema = z.object({
  items: z
    .array(
      z.object({
        id: z.string(),
        muscles: z.array(z.string().min(1)).max(6).optional(),
        targetSeconds: z.number().int().min(30).max(3600).optional(),
        setSeconds: z.number().int().min(10).max(600).optional(),
        transitionSeconds: z.number().int().min(0).max(600).optional(),
      })
    )
    .min(1),
});

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

// Rattrapage : annote muscles travaillés, temps cible et temps de transition
// des exercices (et variantes) d'un programme existant qui n'en ont pas.
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
    return NextResponse.json({ error: "Programme introuvable" }, { status: 404 });
  }

  // Un même mouvement peut être un exercice ou une variante : on aplatit, en
  // ne gardant que ceux auxquels il manque quelque chose.
  type Pending = {
    kind: "exercise" | "variation";
    id: string;
    label: string;
    needsMuscles: boolean;
    needsTarget: boolean;
    needsSet: boolean;
    needsTransition: boolean;
  };
  const pending: Pending[] = [];
  for (const day of program.days) {
    for (const ex of day.exercises) {
      const needs = {
        needsMuscles: ex.muscles.length === 0,
        needsTarget: ex.targetSeconds == null,
        needsSet: ex.setSeconds == null,
        needsTransition: ex.transitionSeconds == null,
      };
      if (
        needs.needsMuscles ||
        needs.needsTarget ||
        needs.needsSet ||
        needs.needsTransition
      ) {
        pending.push({
          kind: "exercise",
          id: ex.id,
          label: `${ex.name} — ${ex.sets} × ${ex.reps}, repos ${ex.restSeconds}s`,
          ...needs,
        });
      }
      for (const v of ex.variations) {
        if (
          v.muscles.length === 0 ||
          v.targetSeconds == null ||
          v.setSeconds == null
        ) {
          pending.push({
            kind: "variation",
            id: v.id,
            label: `${v.name} — ${v.sets} × ${v.reps}, repos ${v.restSeconds}s`,
            needsMuscles: v.muscles.length === 0,
            needsTarget: v.targetSeconds == null,
            needsSet: v.setSeconds == null,
            needsTransition: false,
          });
        }
      }
    }
  }
  if (pending.length === 0) {
    return NextResponse.json({ updated: 0 });
  }

  const knownMuscles = await getKnownMuscles();

  const prompt = `Pour chaque exercice de musculation/fitness ci-dessous, donne :
- "muscles" : ses 1 à 4 groupes musculaires principaux réellement sollicités. ${knownMusclesBlock(knownMuscles) || 'En français, noms courts et cohérents (ex. "Dos", "Biceps", "Pectoraux").'}
- "targetSeconds" : temps cible réaliste pour boucler l'exercice, TOUTES séries et repos compris (secondes), cohérent avec les séries/reps/repos indiqués.
- "setSeconds" : temps cible d'exécution d'UNE série (secondes). Pour un exercice « en secondes » (reps = "30 s"), setSeconds = cette durée.
- "transitionSeconds" (uniquement si demandé) : temps pour passer à l'exercice suivant, installation comprise (30 à 120 s en général).

Exercices :
${pending
  .map(
    (p) =>
      `- id "${p.id}" : ${p.label}${p.needsTransition ? " (donner aussi transitionSeconds)" : ""}`
  )
  .join("\n")}

Réponds UNIQUEMENT avec un objet JSON :
{"items": [{"id": "…", "muscles": ["…"], "targetSeconds": 360, "setSeconds": 45, "transitionSeconds": 60}]}
Un élément par exercice listé, avec son id exact.`;

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
          {
            role: "system",
            content:
              "Tu es un coach sportif expert. Tu réponds uniquement en JSON valide, en français.",
          },
          { role: "user", content: prompt },
        ],
        temperature: 0.2,
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
    const parsed = responseSchema.parse(extractJson(content));
    const byId = new Map(parsed.items.map((i) => [i.id, i]));

    let updated = 0;
    await prisma.$transaction(async (tx) => {
      for (const p of pending) {
        const item = byId.get(p.id);
        if (!item) continue;
        const data: {
          muscles?: string[];
          targetSeconds?: number;
          setSeconds?: number;
          transitionSeconds?: number;
        } = {};
        if (p.needsMuscles && item.muscles && item.muscles.length > 0) {
          data.muscles = resolveMuscleNames(item.muscles, knownMuscles);
        }
        if (p.needsTarget && item.targetSeconds != null) {
          data.targetSeconds = item.targetSeconds;
        }
        if (p.needsSet && item.setSeconds != null) {
          data.setSeconds = item.setSeconds;
        }
        if (p.needsTransition && item.transitionSeconds != null) {
          data.transitionSeconds = item.transitionSeconds;
        }
        if (Object.keys(data).length === 0) continue;
        if (p.kind === "exercise") {
          await tx.exercise.update({ where: { id: p.id }, data });
        } else {
          await tx.exerciseVariation.update({ where: { id: p.id }, data });
        }
        updated++;
      }
    });
    await ensureMusclesExist(
      parsed.items.flatMap((i) => i.muscles ?? [])
    );
    await ensureMuscleCombosExist(
      parsed.items
        .filter((i) => (i.muscles ?? []).length >= 2)
        .map((i) => resolveMuscleNames(i.muscles ?? [], knownMuscles))
    );
    return NextResponse.json({ updated });
  } catch (e) {
    console.error("muscles:", e);
    return NextResponse.json(
      { error: "Le modèle n'a pas renvoyé d'annotation exploitable. Réessaie." },
      { status: 502 }
    );
  }
}
