import "server-only";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { backendUrl } from "@/lib/api/backend";
import { safeNext } from "./next-path";
import type { AccountSession } from "./types";

const accountSessionSchema = z.object({
  user: z.object({
    id: z.string().min(1),
    name: z.string(),
    email: z.string(),
    emailVerified: z.boolean(),
    image: z.string().nullable().optional(),
    createdAt: z.coerce.date(),
    updatedAt: z.coerce.date(),
    phoneNumber: z.string(),
    phoneNumberVerified: z.boolean(),
    institutionId: z.string(),
    majorId: z.string(),
    /* Added by the two-factor plugin; the backend may omit it for an ordinary account. */
    twoFactorEnabled: z.boolean().nullable().default(null),
  }),
  session: z.object({
    id: z.string().min(1),
    userId: z.string().min(1),
    token: z.string(),
    expiresAt: z.coerce.date(),
    createdAt: z.coerce.date(),
    updatedAt: z.coerce.date(),
    ipAddress: z.string().nullable().optional(),
    userAgent: z.string().nullable().optional(),
  }),
});

/** The signed-in account for the current request, or `null` when there is none or the backend cannot say. */
export async function getAccount(): Promise<AccountSession | null> {
  /* Read the request outside the `try`, so Next's dynamic-rendering signal is not swallowed
     together with network errors. */
  const cookie = (await headers()).get("cookie") ?? "";
  try {
    const response = await fetch(`${backendUrl()}/api/auth/get-session`, {
      headers: { cookie },
      cache: "no-store",
    });
    if (response.status !== 200) {
      console.error("Account session request failed", { status: response.status });
      return null;
    }
    const data: unknown = await response.json();
    if (data === null) return null;
    const parsed = accountSessionSchema.safeParse(data);
    if (!parsed.success) {
      console.error("Invalid Account session response");
      return null;
    }
    return parsed.data;
  } catch {
    console.error("Account session request failed");
    return null;
  }
}

/** For pages that need an account: sends the visitor to sign in, and back to `path` afterwards. */
export async function requireAccount(path: string): Promise<AccountSession> {
  const accountSession = await getAccount();
  if (!accountSession) redirect(`/sign-in?${new URLSearchParams({ next: safeNext(path) })}`);
  return accountSession;
}
