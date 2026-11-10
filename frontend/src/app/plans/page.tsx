import type { Metadata } from "next";
import { PageShell, PrimaryButton, Section, SiteHeader } from "@/components/ui/kit";
import { CheckIcon } from "@/components/ui/icons";
import { getPlans, getViewer } from "@/lib/plans/server";
import { coursesLabel, hoursLabel, minutesLabel, sessionsLabel } from "@/lib/plans/labels";
import type { PlanView } from "@/lib/plans/view";
import { PlanCard } from "./plan-card";
import { RetryPlans } from "./retry-plans";

/* The plans differ in quantity, not in function: the tutor is the same on every one, with the same
   explanations, board, questions and summaries. The page says so at the top, and the table under the
   cards is a table of sizes, not of features: four rows of quantities and a fifth saying that
   everything else is shared.

   The plans come from the backend and the student's current plan from their allowance. They are
   shown for information; payment is not part of this app. */

export const metadata: Metadata = {
  title: "Plans — Becan",
  description: "Compare study plans. Prices cover each 30-day period and include VAT.",
};

const ROWS: { label: string; of: (plan: PlanView) => string }[] = [
  { label: "Minutes", of: minutesLabel },
  { label: "In hours", of: (plan) => hoursLabel(plan) ?? "—" },
  { label: "Sessions", of: sessionsLabel },
  { label: "Courses", of: coursesLabel },
];

export default async function PlansPage() {
  const [result, viewer] = await Promise.all([getPlans(), getViewer()]);

  if (!result.ok) {
    return (
      <PageShell withFooter>
        <SiteHeader />

        <Section className="pt-12 pb-16 md:pt-16">
          <h1 className="font-display text-4xl leading-tight font-bold text-ink md:text-5xl">Plans</h1>
          <div className="mt-8 max-w-measure rounded-xl bg-tint-amber p-5 md:p-6">
            <h2 className="text-lg font-bold text-ink">We couldn’t load the plans</h2>
            <p className="mt-2 leading-base text-ink-2">
              We couldn’t get the plans and their prices right now. Try again.
            </p>
            <RetryPlans />
          </div>
        </Section>
      </PageShell>
    );
  }

  const plans = result.plans;
  const emphasis = "font-semibold text-ink";

  return (
    <PageShell withFooter>
      <SiteHeader />

      <Section className="pt-12 pb-16 md:pt-16">
        <h1 className="font-display text-4xl leading-tight font-bold text-ink md:text-5xl">Plans</h1>

        <p className="mt-4 max-w-measure text-lg leading-base text-ink-2">
          You get the same explanations, board, questions and summaries on each plan. Plans differ in{" "}
          <span className={emphasis}>study time</span>, <span className={emphasis}>number of sessions</span> and{" "}
          <span className={emphasis}>number of courses</span>.
        </p>

        <ul className="mt-10 grid items-start gap-4 md:grid-cols-3">
          {plans.map((plan) => (
            <li key={plan.id}>
              <PlanCard plan={plan} current={viewer.planId === plan.id} />
            </li>
          ))}
        </ul>

        {/* The size table, from `md` up; on a phone the cards already carry the same figures. */}
        <div className="mt-12 hidden overflow-hidden rounded-xl border border-line bg-surface md:block">
          <table className="w-full text-start">
            <caption className="sr-only">Compare plan allowances</caption>
            <thead>
              <tr className="border-b border-line">
                <th scope="col" className="px-5 py-4 text-start text-ink-2">
                  <span className="text-sm font-semibold">Comparison</span>
                </th>
                {plans.map((plan) => (
                  <th key={plan.id} scope="col" className="px-5 py-4 text-start font-bold text-ink">
                    {plan.name}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {ROWS.map((row) => (
                <tr key={row.label} className="border-b border-line">
                  <th scope="row" className="px-5 py-4 text-start text-sm font-semibold text-ink-2">
                    {row.label}
                  </th>
                  {plans.map((plan) => (
                    <td key={plan.id} className="px-5 py-4 text-ink">
                      {row.of(plan)}
                    </td>
                  ))}
                </tr>
              ))}

              <tr>
                <th scope="row" className="px-5 py-4 text-start text-sm font-semibold text-ink-2">
                  Explanations, board, questions and summaries
                </th>
                {plans.map((plan) => (
                  <td key={plan.id} className="px-5 py-4">
                    <span className="flex items-center gap-2 text-ink">
                      <CheckIcon className="h-4 w-4 text-success" />
                      Included
                    </span>
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>

        {/* A signed-in student sees their plan marked on its card; a visitor is invited to sign up. */}
        {viewer.signedIn ? null : (
          <div className="mt-10 rounded-xl bg-tint-walnut p-5 md:p-6">
            <p className="leading-base text-ink-2">Try the free plan first. No card needed.</p>
            <PrimaryButton href="/join" className="mt-4">Create account</PrimaryButton>
          </div>
        )}
      </Section>
    </PageShell>
  );
}
