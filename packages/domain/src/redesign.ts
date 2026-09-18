import { z } from 'zod';

export const VISIBILITIES = ['public', 'followers', 'private'] as const;
export const POST_REACTIONS = ['like', 'support', 'fire'] as const;
export const PRODUCT_KINDS = ['physical', 'digital'] as const;
export const PROGRAM_TYPES = ['training', 'nutrition'] as const;

export const pageQuerySchema = z.object({
  offset: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const socialPostInputSchema = z.object({
  body: z.string().trim().min(1).max(5000),
  visibility: z.enum(VISIBILITIES).default('public'),
  imageUrl: z.url().max(500).optional(),
});

export const commentInputSchema = z.object({
  body: z.string().trim().min(1).max(2000),
});

export const teamEventInputSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    description: z.string().trim().min(1).max(5000),
    startsAt: z.coerce.date(),
    endsAt: z.coerce.date(),
    location: z.string().trim().min(1).max(300),
    capacity: z.number().int().positive().max(10000).optional(),
    visibility: z.enum(VISIBILITIES).default('public'),
  })
  .refine((value) => value.endsAt > value.startsAt, { message: 'endsAt must follow startsAt' });

export const partnerAdInputSchema = z.object({
  sportId: z.number().int().positive().optional(),
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().min(1).max(3000),
  city: z.string().trim().min(1).max(200),
  availableAt: z.coerce.date().optional(),
});

export const productInputSchema = z.object({
  categoryId: z.number().int().positive(),
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().min(1).max(5000),
  price: z.number().int().min(0),
  kind: z.enum(PRODUCT_KINDS),
  stock: z.number().int().min(0).optional(),
  program: z
    .object({ programType: z.enum(PROGRAM_TYPES), content: z.record(z.string(), z.unknown()) })
    .optional(),
});

export const workoutInputSchema = z.object({
  occurredAt: z.coerce.date(),
  title: z.string().trim().min(1).max(200),
  notes: z.string().trim().max(2000).optional(),
  durationMinutes: z.number().int().positive().max(1440).optional(),
  exercises: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(200),
        sets: z.number().int().positive().optional(),
        reps: z.number().int().positive().optional(),
        weightKg: z.number().nonnegative().optional(),
        durationSeconds: z.number().int().positive().optional(),
      }),
    )
    .max(100)
    .default([]),
});

export const nutritionTargetSchema = z.object({
  calories: z.number().int().positive().max(20000),
  proteinGrams: z.number().nonnegative().optional(),
  fatGrams: z.number().nonnegative().optional(),
  carbsGrams: z.number().nonnegative().optional(),
});
