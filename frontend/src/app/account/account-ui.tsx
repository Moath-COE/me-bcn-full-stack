"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckIcon } from "@/components/ui/icons";

/** One section of the account page. */
export function AccountCard({
  id,
  title,
  children,
}: {
  id?: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-6 rounded-xl border border-line bg-surface p-5 md:p-6">
      <h2 className="text-lg font-bold text-ink md:text-xl">{title}</h2>
      {children}
    </section>
  );
}

/* Profile fields save on their own, so there is no Save button to forget. The notice is a live
   region, and it clears after 2.5 seconds. */
export function useSaveNotice() {
  const [saved, setSaved] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const ping = useCallback(() => {
    setSaved(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setSaved(false), 2500);
  }, []);

  return { saved, ping };
}

export function SaveNotice({ saved }: { saved: boolean }) {
  return (
    <p role="status" aria-live="polite" className="flex min-h-6 items-center gap-1.5 text-sm font-semibold text-ink-2">
      {saved ? (
        <>
          <CheckIcon className="h-4 w-4" />
          Saved
        </>
      ) : null}
    </p>
  );
}

/** Re-runs the page's server data fetch. */
export function RefreshButton({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={() => router.refresh()}
      className="mt-4 inline-flex min-h-11 items-center rounded-pill border border-line px-4 font-semibold text-ink"
    >
      {children}
    </button>
  );
}
