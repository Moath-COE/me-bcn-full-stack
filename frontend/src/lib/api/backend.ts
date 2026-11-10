import "server-only";

import type { z } from "zod";
import { backendErrorSchema } from "./error";

/** Base URL of the Express API, read on the server only. */
export function backendUrl(): string {
  return process.env.BACKEND_URL?.trim().replace(/\/+$/, "") || "http://localhost:3000";
}

export type BackendResult<T> =
  | { ok: true; data: T }
  | { ok: false; kind: "network" | "http" | "invalid"; status?: number; code?: string };

/** Calls `GET /api/v1{path}` and validates the response. Never throws: callers decide what a failure shows. */
export async function readBackend<T>(
  path: string,
  schema: z.ZodType<T, z.ZodTypeDef, unknown>,
  init: RequestInit,
): Promise<BackendResult<T>> {
  let response: Response;
  try {
    response = await fetch(`${backendUrl()}/api/v1${path}`, init);
  } catch {
    console.error("Backend request failed", { path });
    return { ok: false, kind: "network" };
  }

  let data: unknown;
  try {
    data = await response.json();
  } catch {
    console.error("Invalid backend JSON", { path, status: response.status });
    return { ok: false, kind: "invalid", status: response.status };
  }

  if (!response.ok) {
    const error = backendErrorSchema.safeParse(data);
    const code = error.success ? error.data.error.code : undefined;
    console.error("Backend request failed", { path, status: response.status, code });
    return error.success
      ? { ok: false, kind: "http", status: response.status, code }
      : { ok: false, kind: "invalid", status: response.status };
  }

  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    console.error("Invalid backend response", { path, status: response.status });
    return { ok: false, kind: "invalid", status: response.status };
  }
  return { ok: true, data: parsed.data };
}
