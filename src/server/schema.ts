import { z } from 'zod';

const steer = z.union([z.literal(-1), z.literal(0), z.literal(1)]);

export const ActionSchema = z.object({ steer, throttle: steer });

export const ObservationSchema = z.object({
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
