"use client";

import { useEffect, useState } from "react";
import { authClient } from "@/lib/auth/client";
import { hasPasswordAccount } from "@/lib/auth/google";

/* `null` while loading. A failed read counts as an account with a password: that is the common
   case, and the backend rejects a wrong request with an error the form can show. */
export function useHasPassword(): boolean | null {
  const [hasPassword, setHasPassword] = useState<boolean | null>(null);
  useEffect(() => {
    let alive = true;
    authClient.listAccounts().then(
      ({ data, error }) => {
        if (alive) setHasPassword(error || !data ? true : hasPasswordAccount(data));
      },
      () => {
        if (alive) setHasPassword(true);
      },
    );
    return () => {
      alive = false;
    };
  }, []);
  return hasPassword;
}
