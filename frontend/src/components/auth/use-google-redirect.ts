"use client";

import { useEffect, useState } from "react";
import { authClient } from "@/lib/auth/client";

type SocialRequest = Parameters<typeof authClient.signIn.social>[0];
type SocialError = { code?: string; status?: number };

/* The library sends the browser to Google once the request succeeds. The button stays disabled
   until then, and is released if the student comes back with the back button and the browser
   restores the page from its back/forward cache. */
export function useGoogleRedirect() {
  const [redirecting, setRedirecting] = useState(false);
  useEffect(() => {
    const reset = (event: PageTransitionEvent) => {
      if (event.persisted) setRedirecting(false);
    };
    window.addEventListener("pageshow", reset);
    return () => window.removeEventListener("pageshow", reset);
  }, []);

  /* Resolves to the error if the request fails before the redirect, or `null` once it is under way. */
  const start = async (request: SocialRequest): Promise<SocialError | null> => {
    setRedirecting(true);
    try {
      const { error } = await authClient.signIn.social(request);
      if (error) setRedirecting(false);
      return error ?? null;
    } catch {
      setRedirecting(false);
      return {};
    }
  };

  return { redirecting, start };
}
