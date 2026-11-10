import type { Metadata } from "next";
import { PageShell, QuietLink, Section, SiteHeader } from "@/components/ui/kit";

export const metadata: Metadata = { title: "Page not found — Becan" };

const WAYS = [
  { href: "/dashboard", label: "My courses" },
  { href: "/courses", label: "Find a course" },
  { href: "/", label: "Home" },
];

export default function NotFound() {
  return (
    <PageShell>
      <SiteHeader />

      <Section className="pt-12 pb-16 md:pt-16">
        <div className="max-w-measure">
          <h1 className="font-display text-4xl leading-tight font-bold text-ink md:text-5xl">
            This page isn’t here
          </h1>
          <p className="mt-4 leading-base text-ink-2">
            The link may be old, or a character is missing from the address.
          </p>

          <nav aria-label="Where to go next" className="mt-8 flex flex-col items-start">
            {WAYS.map((way) => (
              <QuietLink key={way.href} href={way.href}>
                {way.label}
              </QuietLink>
            ))}
          </nav>
        </div>
      </Section>
    </PageShell>
  );
}
