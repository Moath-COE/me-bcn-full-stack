import { allowanceSchema, type Allowance } from "./schema";

export async function readSessionAllowance(signal: AbortSignal): Promise<Allowance | null> {
  try {
    const response = await fetch("/api/v1/me/allowance", { cache: "no-store", signal });
    if (!response.ok) return null;
    const parsed = allowanceSchema.safeParse(await response.json());
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
