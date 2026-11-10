import { z } from "zod";
import { englishText } from "@/lib/api/english-text";

const countSchema = z.number().int().nonnegative();
/** A limit of `null` means unlimited. */
const limitSchema = countSchema.nullable();

/** `GET /api/v1/me/allowance`: the student's plan, its limits, and usage in the current 30-day period. */
export const allowanceSchema = z.object({
  /** True only for an admin account, which studies without limits. */
  unlimited: z.boolean().optional().default(false),
  plan: z.object({ id: z.string().min(1), name: englishText }),
  period: z.object({
    start: z.string().datetime({ offset: true }),
    end: z.string().datetime({ offset: true }),
  }),
  limits: z.object({
    sessions: limitSchema,
    seconds: limitSchema,
    enrollments: limitSchema,
    sessionSeconds: limitSchema,
    minStartSeconds: limitSchema,
  }),
  usage: z.object({
    sessions: countSchema,
    seconds: countSchema,
    enrollments: countSchema,
  }),
});

export type Allowance = z.infer<typeof allowanceSchema>;
