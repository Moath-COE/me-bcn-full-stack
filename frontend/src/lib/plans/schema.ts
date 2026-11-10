import { z } from "zod";
import { englishText } from "@/lib/api/english-text";

/** A limit of `null` means unlimited. */
const limitSchema = z.number().int().nonnegative().nullable();

export const planSchema = z.object({
  id: z.string().min(1),
  name: englishText,
  /** Price of one 30-day period in halalas (1/100 SAR), VAT included. */
  priceHalalas: z.number().int().nonnegative(),
  featured: z.boolean(),
  badge: englishText.nullable(),
  limits: z.object({
    sessions: limitSchema,
    seconds: limitSchema,
    enrollments: limitSchema,
    sessionSeconds: limitSchema,
    minStartSeconds: limitSchema,
  }),
});

/** `GET /api/v1/plans`. An empty list has nothing to show, so it is treated as an invalid response. */
export const plansResponseSchema = z.object({ plans: z.array(planSchema).min(1) });

export type ApiPlan = z.infer<typeof planSchema>;
