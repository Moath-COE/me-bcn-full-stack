import { backendErrorSchema } from "@/lib/api/error";

export function tokenErrorOutcome(status: number, body: unknown): "used-up" | "connection-failed" {
  const parsed = backendErrorSchema.safeParse(body);
  if (status === 403 && parsed.success && (
    parsed.data.error.code === "SESSIONS_USED_UP" || parsed.data.error.code === "MINUTES_USED_UP"
  )) return "used-up";
  return "connection-failed";
}

export class AllowanceUsedUpError extends Error {}
