import "server-only";

import { z } from "zod";
import { backendUrl } from "@/lib/api/backend";
import { englishText } from "@/lib/api/english-text";

const institutionsSchema = z.array(
  z.object({
    id: z.string(),
    name: englishText,
    majors: z.array(z.object({ id: z.string(), name: englishText })),
  }),
);

export type Institution = z.infer<typeof institutionsSchema>[number];

/** Institutions and their majors, for the sign-up and account forms. An empty list means the request failed. */
export async function getInstitutions(): Promise<Institution[]> {
  try {
    const response = await fetch(`${backendUrl()}/api/v1/institutions`, { next: { revalidate: 300 } });
    if (!response.ok) {
      console.error("Institutions request failed", { status: response.status });
      return [];
    }
    const parsed = institutionsSchema.safeParse(await response.json());
    if (!parsed.success) {
      console.error("Invalid institutions response");
      return [];
    }
    return parsed.data;
  } catch {
    console.error("Institutions request failed");
    return [];
  }
}
