"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { useAccount } from "@/lib/auth/client";
import { safeNext } from "@/lib/auth/next-path";

const NEXT_KEY = "becan:next";
const subscribe = (notify: () => void) => {
  window.addEventListener("storage", notify);
  window.addEventListener(NEXT_KEY, notify);
  return () => {
    window.removeEventListener("storage", notify);
    window.removeEventListener(NEXT_KEY, notify);
  };
};

/** Where the student goes after signing in: the `next` parameter, or the copy an earlier auth screen stored. */
export function useAuthReturn(next: string, remember = true) {
  const storedDestination = useSyncExternalStore(
    subscribe,
    () => {
      try {
        return safeNext(next || sessionStorage.getItem(NEXT_KEY));
      } catch {
        return safeNext(next);
      }
    },
    () => safeNext(next),
  );
  const [consumedReturn, setConsumedReturn] = useState<{
    next: string;
    destination: string;
  } | null>(null);
  const destination = consumedReturn?.next === next
    ? consumedReturn.destination
    : storedDestination;

  /* Only the destination is stored, so the chosen chapter survives moving between auth screens. */
  useEffect(() => {
    if (!next || !remember) return;
    try {
      sessionStorage.setItem(NEXT_KEY, safeNext(next));
      window.dispatchEvent(new Event(NEXT_KEY));
    } catch {
      /* Blocked storage must not block sign-up. */
    }
  }, [next, remember]);

  const clearReturn = useCallback(() => {
    /* Removing the stored copy must not change where this screen's own links point. */
    setConsumedReturn({ next, destination });
    try {
      sessionStorage.removeItem(NEXT_KEY);
    } catch {
      /* Blocked storage must not block sign-in. */
    }
  }, [next, destination]);

  return { destination, clearReturn };
}

export function useSignedInRedirect(
  destination: string,
  clearReturn: () => void,
) {
  const { account, isPending } = useAccount();
  const router = useRouter();
  useEffect(() => {
    if (!isPending && account) {
      clearReturn();
      router.replace(destination);
    }
  }, [account, isPending, destination, clearReturn, router]);
}
