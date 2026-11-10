import "server-only";

import { headers } from "next/headers";
import { readBackend } from "@/lib/api/backend";
import { studentHeaders } from "@/lib/api/forwarded-headers";
import { allowanceSchema } from "./schema";

export async function getAllowance() {
  // Read the request outside readBackend's try/catch so Next.js still sees the dynamic-rendering signal.
  const forwarded = studentHeaders(await headers());
  return readBackend("/me/allowance", allowanceSchema, { headers: forwarded, cache: "no-store" });
}
