import { z } from 'zod';

export const ObservationSchema = z.object({
  targetX: z.number().min(-1.3).max(1.3).optional(),
  frame: z.number().int().nonnegative(),
  speed: z.number().min(0).max(1),
  road: z.object({ left: z.number(), right: z.number(), centerOffset: z.number() }),
  obstacles: z
    .array(
      z.object({
        cls: z.enum(['car', 'truck', 'bus', 'motorcycle']),
        conf: z.number(),
        x: z.number(),
        y: z.number(),
        w: z.number(),
        h: z.number(),
      }),
    )
    .max(6),
});
