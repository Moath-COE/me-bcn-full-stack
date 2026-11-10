"use server";

import { revalidatePath } from "next/cache";
import { requireAccount } from "@/lib/auth/session";

/* A router refresh alone would reuse the cached (failed) institutions response on the server. */
export async function retryInstitutions() {
  await requireAccount("/account");
  revalidatePath("/account", "page");
}
