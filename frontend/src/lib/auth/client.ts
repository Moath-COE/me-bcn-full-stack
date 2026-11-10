"use client";

import { createAuthClient } from "better-auth/react";
import { inferAdditionalFields, twoFactorClient } from "better-auth/client/plugins";
import { useEffect } from "react";
import { clearGoogleJoinDraft } from "./google";
import type { Account } from "./types";

export const authClient = createAuthClient({
  /* `twoFactorClient` takes no redirect option: the sign-in form navigates to `/two-factor`
     itself, so the destination travels with it. */
  plugins: [twoFactorClient(), inferAdditionalFields({
    user: {
      phoneNumber: { type: "string", required: true },
      phoneNumberVerified: { type: "boolean", required: false, input: false, defaultValue: false },
      institutionId: { type: "string", required: true },
      majorId: { type: "string", required: true },
    },
  })],
  /* The backend picks the language of the emails it sends from this header. */
  fetchOptions: {
    onRequest(context) {
      context.headers.set("x-becan-locale", "en");
    },
  },
});

export function useAccount(): { account: Account | null; isPending: boolean } {
  const { data, isPending } = authClient.useSession();
  const account = data?.user ?? null;
  /* A signed-in account means the trip to Google succeeded; its draft is no longer needed. */
  useEffect(() => {
    if (account) clearGoogleJoinDraft();
  }, [account]);
  return { account, isPending };
}
