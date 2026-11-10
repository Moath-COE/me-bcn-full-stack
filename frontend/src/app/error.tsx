"use client";

import { PageShell, PrimaryButton, QuietLink, Section, SiteHeader } from "@/components/ui/kit";

/* The error boundary for every page. It says what happened, why, and what to do next. */
export default function ErrorScreen({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <PageShell>
      <SiteHeader />

      <Section className="pt-12 pb-16 md:pt-16">
        <div className="max-w-measure">
          <h1 className="font-display text-4xl leading-tight font-bold text-ink md:text-5xl">
            The page didn’t open
          </h1>
          <p className="mt-4 leading-base text-ink-2">
            Something stopped on our end while loading the page. Your device and connection are fine, and
            your progress is safe.
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
            <PrimaryButton onClick={reset} className="w-full sm:w-fit">
              Try again
            </PrimaryButton>
            <QuietLink href="/dashboard">Back to your courses</QuietLink>
          </div>

          {/* The digest matches the server log entry for this error. */}
          {error.digest ? (
            <p className="mt-8 text-sm text-ink-2">
              Error reference: <span className="font-semibold text-ink">{error.digest}</span>
            </p>
          ) : null}
        </div>
      </Section>
    </PageShell>
  );
}
