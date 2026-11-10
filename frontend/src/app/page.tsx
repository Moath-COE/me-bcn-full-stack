import { CaptureBand, Marked, PageShell, PrimaryButton, QuietLink, Section, SiteHeader } from "@/components/ui/kit";

const STEPS = [
  {
    title: "Choose your course",
    detail: "Find it by name or code and enroll. Its chapters are ready to study.",
  },
  {
    title: "Choose a chapter",
    detail: "See how long it takes and how many lessons it has before you start.",
  },
  {
    title: "Start the session",
    detail: "The tutor explains out loud and writes on the board. Ask questions by voice at any point.",
  },
];

const POINTS = [
  { claim: "Built on your course", why: "The tutor teaches from the chapter’s own material, slide by slide." },
  { claim: "A two-way conversation", why: "Interrupt, ask, and answer its questions to check you understood." },
  { claim: "Free to start", why: "The free plan includes sessions every 30 days. No card needed." },
];

export default function LandingPage() {
  return (
    <PageShell withFooter>
      <SiteHeader />

      <main>
        <Section className="pt-12 pb-14 md:pt-20 md:pb-20">
          <h1 className="max-w-4xl font-display text-4xl leading-tight font-bold text-ink md:text-5xl xl:text-6xl">
            Your personal course{" "}
            <span className="mx-3 inline-block">
              <Marked>tutor</Marked>
            </span>
          </h1>
          <p className="mt-6 max-w-measure text-lg leading-base text-ink-2 md:text-xl">
            Becan explains your university course by voice, writes on a board as it goes, and asks questions
            to check you understood.
          </p>
          <div className="mt-9 flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-6">
            <PrimaryButton href="/courses" className="w-full sm:w-fit">
              Choose your course
            </PrimaryButton>
            <QuietLink href="/sign-in">I already have an account</QuietLink>
          </div>
        </Section>

        <Section id="how" className="pb-14 md:pb-20">
          <h2 className="font-display text-3xl leading-tight font-bold text-ink md:text-4xl">How it works</h2>
          <ol className="mt-8 grid gap-4 md:grid-cols-3">
            {STEPS.map((step, index) => (
              <li key={step.title} className="rounded-xl border border-line bg-surface p-6">
                <p className="text-sm font-semibold text-ink-2">Step {index + 1}</p>
                <h3 className="mt-2 text-xl font-bold text-ink">{step.title}</h3>
                <p className="mt-2 leading-base text-ink-2">{step.detail}</p>
              </li>
            ))}
          </ol>
        </Section>

        <Section className="pb-16 md:pb-24">
          <ul className="grid gap-4 md:grid-cols-3">
            {POINTS.map((point) => (
              <li key={point.claim} className="rounded-xl bg-tint-aubergine p-6">
                <h3 className="text-xl font-bold text-ink">{point.claim}</h3>
                <p className="mt-2 leading-base text-ink-2">{point.why}</p>
              </li>
            ))}
          </ul>
        </Section>

        <CaptureBand
          title="Ready to start?"
          body="Create an account, enroll in a course, and hear your first explanation."
          cta="Create account"
          href="/join"
        />
      </main>
    </PageShell>
  );
}
