"use server";

import { prisma } from "@/lib/prisma";
import { programDraftSchema, type ProgramDraft } from "@/lib/program-schema";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

// ---------- Contextes & équipement ----------

export async function createLocation(name: string, icon: string) {
  if (!name.trim()) return;
  await prisma.location.create({ data: { name: name.trim(), icon } });
  revalidatePath("/equipment");
}

export async function deleteLocation(id: string) {
  await prisma.location.delete({ where: { id } });
  revalidatePath("/equipment");
  revalidatePath("/");
}

export async function toggleLocationEquipment(
  locationId: string,
  equipmentId: string,
  enabled: boolean
) {
  if (enabled) {
    await prisma.locationEquipment.upsert({
      where: { locationId_equipmentId: { locationId, equipmentId } },
      update: {},
      create: { locationId, equipmentId },
    });
  } else {
    await prisma.locationEquipment.deleteMany({
      where: { locationId, equipmentId },
    });
  }
  revalidatePath("/equipment");
}

export async function createEquipment(name: string, category: string) {
  if (!name.trim()) return;
  await prisma.equipment.upsert({
    where: { name: name.trim() },
    update: {},
    create: { name: name.trim(), category: category || "Accessoires" },
  });
  revalidatePath("/equipment");
}

// ---------- Réglages ----------

export async function saveSettings(data: {
  openrouterApiKey?: string;
  openrouterModel?: string;
  kieApiKey?: string;
  voiceInput?: boolean;
  voiceAnnounce?: boolean;
}) {
  const update: Record<string, string | boolean | null> = {};
  // Champ vide = ne pas changer ; "-" seul = effacer la clé.
  if (data.openrouterApiKey !== undefined && data.openrouterApiKey !== "") {
    update.openrouterApiKey =
      data.openrouterApiKey === "-" ? null : data.openrouterApiKey.trim();
  }
  if (data.kieApiKey !== undefined && data.kieApiKey !== "") {
    update.kieApiKey = data.kieApiKey === "-" ? null : data.kieApiKey.trim();
  }
  if (data.openrouterModel) update.openrouterModel = data.openrouterModel;
  if (data.voiceInput !== undefined) update.voiceInput = data.voiceInput;
  if (data.voiceAnnounce !== undefined)
    update.voiceAnnounce = data.voiceAnnounce;

  await prisma.settings.upsert({
    where: { id: 1 },
    update,
    create: { id: 1, ...update },
  });
  revalidatePath("/settings");
}

// ---------- Programmes ----------

export async function saveProgram(
  draft: ProgramDraft,
  meta: { locationId?: string | null; goal?: string | null; level?: string | null }
): Promise<string> {
  const parsed = programDraftSchema.parse(draft);
  const program = await prisma.program.create({
    data: {
      name: parsed.name,
      description: parsed.description ?? null,
      goal: meta.goal ?? null,
      level: meta.level ?? null,
      locationId: meta.locationId ?? null,
      days: {
        create: parsed.days.map((day, di) => ({
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
              notes: ex.notes ?? null,
            })),
          },
        })),
      },
    },
  });
  revalidatePath("/");
  return program.id;
}

export type ProgramUpdatePayload = {
  name: string;
  description?: string | null;
  days: {
    id?: string;
    name: string;
    focus?: string | null;
    exercises: {
      id?: string;
      name: string;
      sets: number;
      reps: string;
      restSeconds: number;
      weightHint?: string | null;
      equipment: string[];
      notes?: string | null;
    }[];
  }[];
};

// Met à jour un programme en conservant les ids existants (et donc
// l'historique de séances) quand c'est possible.
export async function updateProgram(programId: string, payload: ProgramUpdatePayload) {
  await prisma.$transaction(async (tx) => {
    await tx.program.update({
      where: { id: programId },
      data: { name: payload.name, description: payload.description ?? null },
    });

    const keepDayIds = payload.days.map((d) => d.id).filter(Boolean) as string[];
    await tx.programDay.deleteMany({
      where: { programId, id: { notIn: keepDayIds } },
    });

    for (let di = 0; di < payload.days.length; di++) {
      const day = payload.days[di];
      let dayId = day.id;
      if (dayId) {
        await tx.programDay.update({
          where: { id: dayId },
          data: { dayIndex: di, name: day.name, focus: day.focus ?? null },
        });
      } else {
        const created = await tx.programDay.create({
          data: {
            programId,
            dayIndex: di,
            name: day.name,
            focus: day.focus ?? null,
          },
        });
        dayId = created.id;
      }

      const keepExIds = day.exercises.map((e) => e.id).filter(Boolean) as string[];
      await tx.exercise.deleteMany({
        where: { dayId, id: { notIn: keepExIds } },
      });

      for (let ei = 0; ei < day.exercises.length; ei++) {
        const ex = day.exercises[ei];
        const data = {
          order: ei,
          name: ex.name,
          sets: ex.sets,
          reps: ex.reps,
          restSeconds: ex.restSeconds,
          weightHint: ex.weightHint ?? null,
          equipment: ex.equipment ?? [],
          notes: ex.notes ?? null,
        };
        if (ex.id) {
          await tx.exercise.update({ where: { id: ex.id }, data });
        } else {
          await tx.exercise.create({ data: { ...data, dayId } });
        }
      }
    }
  });
  revalidatePath(`/programs/${programId}`);
  revalidatePath("/");
}

export async function deleteProgram(id: string) {
  await prisma.program.delete({ where: { id } });
  revalidatePath("/");
  redirect("/");
}

// ---------- Séances ----------

export async function startSession(dayId: string) {
  // Reprend la séance en cours pour ce jour si elle existe.
  const existing = await prisma.workoutSession.findFirst({
    where: { dayId, completedAt: null },
    orderBy: { startedAt: "desc" },
  });
  const session =
    existing ??
    (await prisma.workoutSession.create({ data: { dayId } }));
  redirect(`/workout/${session.id}`);
}

export async function abandonSession(sessionId: string) {
  await prisma.workoutSession.delete({ where: { id: sessionId } });
  revalidatePath("/");
  redirect("/");
}
