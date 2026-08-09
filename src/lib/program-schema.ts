import { z } from "zod";

export const exerciseSchema = z.object({
  name: z.string().min(1),
  sets: z.number().int().min(1).max(12),
  reps: z.string().min(1),
  restSeconds: z.number().int().min(0).max(600),
  weightHint: z.string().nullish(),
  equipment: z.array(z.string()).default([]),
  notes: z.string().nullish(),
});

export const daySchema = z.object({
  name: z.string().min(1),
  focus: z.string().nullish(),
  exercises: z.array(exerciseSchema).min(1),
});

export const programDraftSchema = z.object({
  name: z.string().min(1),
  description: z.string().nullish(),
  days: z.array(daySchema).min(1),
});

export type ExerciseDraft = z.infer<typeof exerciseSchema>;
export type DayDraft = z.infer<typeof daySchema>;
export type ProgramDraft = z.infer<typeof programDraftSchema>;
