import { z } from "zod";

/** The API returns display text in Arabic and English (`{ ar, en }`). This app shows the English one. */
export const englishText = z
  .object({ ar: z.string(), en: z.string().min(1) })
  .transform((text) => text.en);
