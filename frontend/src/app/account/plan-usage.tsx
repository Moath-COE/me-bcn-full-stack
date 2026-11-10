import { QuietLink } from "@/components/ui/kit";
import { formatRenewalDate } from "@/lib/allowance/format";
import { minutesLeft, usedUp } from "@/lib/allowance/rules";
import type { Allowance } from "@/lib/allowance/schema";
import { AccountCard, RefreshButton } from "./account-ui";

const usage = (used: number, limit: number | null) => (limit === null ? String(used) : `${used} of ${limit}`);

/** The student's plan, its limits, and what they have used in the current 30-day period. */
export function PlanUsage({ allowance }: { allowance: Allowance | null }) {
  if (!allowance) {
    return (
      <AccountCard id="plan" title="Plan and usage">
        <p className="mt-2 max-w-measure leading-base text-ink-2">
          We couldn’t get your limits and usage right now. Try again.
        </p>
        <RefreshButton>Try again</RefreshButton>
      </AccountCard>
    );
  }

  const { limits, usage: used } = allowance;
  const remaining = minutesLeft(allowance);
  const renewal = formatRenewalDate(new Date(allowance.period.end));
  const rows = [
    { label: "Sessions", value: usage(used.sessions, limits.sessions) },
    {
      label: "Minutes used",
      value: usage(Math.ceil(used.seconds / 60), limits.seconds === null ? null : Math.floor(limits.seconds / 60)),
    },
    { label: "Courses", value: usage(used.enrollments, limits.enrollments) },
  ];

  return (
    <AccountCard id="plan" title="Plan and usage">
      <p className="mt-4 text-sm leading-base text-ink-2">Minutes left until renewal</p>
      <p className="mt-3 text-4xl leading-none font-bold tracking-tight text-ink tabular-nums">
        {remaining === null ? "Unlimited" : remaining}
      </p>
      {usedUp(allowance) ? (
        <p className="mt-3 text-sm leading-base text-ink-2">
          You’ve reached your usage limits for this period. You can’t start a new session before {renewal}.
        </p>
      ) : null}

      <dl className="mt-6 divide-y divide-line">
        {rows.map((row) => (
          <div key={row.label} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-3">
            <dt className="text-ink-2">{row.label}</dt>
            <dd className="text-end font-semibold text-ink tabular-nums">{row.value}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-5 border-t border-line pt-5">
        <p className="font-semibold text-ink">{allowance.plan.name}</p>
        <p className="mt-1 text-sm leading-base text-ink-2">Your usage limits renew on {renewal}</p>
      </div>
      <div className="mt-3">
        <QuietLink href="/plans">Compare plans</QuietLink>
      </div>
    </AccountCard>
  );
}
