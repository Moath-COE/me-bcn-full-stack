"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ErrorText } from "@/components/ui/kit";
import { authClient } from "@/lib/auth/client";
import { authErrorMessage } from "@/lib/auth/errors";
import { runAccountMutation } from "./auth-mutations";

export function SignOut() {
  const router = useRouter();
  const busy = useRef(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  const signOut = async () => {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    setError("");
    try {
      const result = await runAccountMutation(() => authClient.signOut());
      if (result.error) {
        setError(authErrorMessage(result.error));
        return;
      }
      router.replace("/");
      router.refresh();
    } catch {
      setError(authErrorMessage(null));
    } finally {
      busy.current = false;
      setPending(false);
    }
  };

  return (
    <div className="mt-4">
      <button
        type="button"
        disabled={pending}
        aria-busy={pending}
        aria-describedby={error ? "sign-out-error" : undefined}
        onClick={signOut}
        className="inline-flex min-h-11 items-center rounded-pill border border-line px-4 font-semibold text-ink disabled:opacity-60"
      >
        {pending ? "Signing out…" : "Sign out"}
      </button>
      {error ? (
        <div role="alert">
          <ErrorText id="sign-out-error">{error}</ErrorText>
        </div>
      ) : null}
    </div>
  );
}
