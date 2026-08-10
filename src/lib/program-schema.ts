import { z } from "zod";

const exerciseBaseShape = {
  name: z.string().min(1),
  sets: z.number().int().min(1).max(12),
  reps: z.string().min(1),
  restSeconds: z.number().int().min(0).max(600),
  weightHint: z.string().nullish(),
  equipment: z.array(z.string()).default([]),
  notes: z.string().nullish(),
};

// Variante d'un exercice : mêmes muscles, jouée en alternance selon les passages.
export const variationSchema = z.object(exerciseBaseShape);

export const exerciseSchema = z.object({
  ...exerciseBaseShape,
  variations: z.array(variationSchema).max(2).default([]),
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

export type VariationDraft = z.infer<typeof variationSchema>;
export type ExerciseDraft = z.infer<typeof exerciseSchema>;
export type DayDraft = z.infer<typeof daySchema>;
export type ProgramDraft = z.infer<typeof programDraftSchema>;
