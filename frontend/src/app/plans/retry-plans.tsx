"use client";

import { useRouter } from "next/navigation";

/** Retries after the plans could not be loaded, by rendering the page on the server again. */
export function RetryPlans() {
  const router = useRouter();

  return (
    <button
      type="button"
      onClick={() => router.refresh()}
      className="mt-4 inline-flex min-h-11 items-center rounded-pill border border-line px-4 font-semibold text-ink"
    >
      Try again
    </button>
  );
}
