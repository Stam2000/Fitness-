import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSettings } from "@/lib/settings";
import { programDraftSchema } from "@/lib/program-schema";
import { requireApiUser } from "@/lib/session";

const requestSchema = z.object({
  locationId: z.string(),
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

// Adapte un programme existant à l'équipement d'un autre contexte et
// l'enregistre comme nouveau programme.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireApiUser();
  if (user instanceof NextResponse) return user;
  const { id } = await params;
  const body = requestSchema.safeParse(await req.json());
  if (!body.success) {
    return NextResponse.json({ error: "Requête invalide" }, { status: 400 });
  }

  const settings = await getSettings();
  if (!settings.openrouterApiKey) {
    return NextResponse.json(
      { error: "Aucune clé OpenRouter configurée (Réglages)." },
      { status: 400 }
    );
  }

  // Programme source ET contexte cible doivent appartenir à l'appelant.
  const [program, target] = await Promise.all([
    prisma.program.findFirst({
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
    }),
    prisma.location.findFirst({
      where: { id: body.data.locationId, userId: user.id },
      include: { equipment: { include: { equipment: true } } },
    }),
  ]);
  if (!program || !target) {
    return NextResponse.json(
      { error: "Programme ou contexte introuvable" },
      { status: 404 }
    );
  }

  const equipmentNames = target.equipment.map((e) => e.equipment.name);
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

  const prompt = `Adapte ce programme au contexte « ${target.name} » dont l'équipement disponible est : ${equipmentNames.length > 0 ? equipmentNames.join(", ") : "aucun (poids du corps uniquement)"}.

Programme source :
${JSON.stringify(source, null, 2)}

Règles :
- Garde la même structure (mêmes jours, même logique de séance, volumes équivalents).
- Remplace chaque exercice impossible avec l'équipement cible par l'équivalent le plus proche ciblant les mêmes muscles ; garde tels quels ceux qui restent réalisables.
- Adapte aussi les "variations" de chaque exercice ; si l'équipement cible ne permet plus d'alternative pertinente pour une variation, supprime-la ("variations": []).
- Utilise EXCLUSIVEMENT l'équipement listé (ou le poids du corps).
- Adapte "name" du programme au nouveau contexte (ex. « ${program.name} — ${target.name} »).
Réponds UNIQUEMENT avec l'objet JSON du programme adapté, au même format que le programme source.`;

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

    const created = await prisma.program.create({
      data: {
        name: draft.name,
        description: draft.description ?? null,
        goal: program.goal,
        level: program.level,
        locationId: target.id,
        userId: user.id,
        days: {
          create: draft.days.map((day, di) => ({
            dayIndex: di,
            name: day.name,
            focus: day.focus ?? null,
            exercises: {
              create: day.exercises.map((ex, ei) => ({
                order: ei,
                name: ex.name,
                sets: ex.sets,
                reps: ex.reps,
                restSeconds: ex.restSeconds,
                weightHint: ex.weightHint ?? null,
                equipment: ex.equipment ?? [],
                muscles: ex.muscles ?? [],
                targetSeconds: ex.targetSeconds ?? null,
                setSeconds: ex.setSeconds ?? null,
                transitionSeconds: ex.transitionSeconds ?? null,
                notes: ex.notes ?? null,
                variations: {
                  create: (ex.variations ?? []).map((v, vi) => ({
                    order: vi,
                    name: v.name,
                    sets: v.sets,
                    reps: v.reps,
                    restSeconds: v.restSeconds,
                    weightHint: v.weightHint ?? null,
                    equipment: v.equipment ?? [],
                    muscles: v.muscles ?? [],
                    targetSeconds: v.targetSeconds ?? null,
                    setSeconds: v.setSeconds ?? null,
                    notes: v.notes ?? null,
                  })),
                },
              })),
            },
          })),
        },
      },
    });
    return NextResponse.json({ programId: created.id });
  } catch (e) {
    console.error("convert:", e);
    return NextResponse.json(
      { error: "L'adaptation a échoué. Réessaie ou change de modèle." },
      { status: 502 }
    );
  }
}
