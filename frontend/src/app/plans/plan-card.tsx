import { coursesLabel, hoursLabel, sessionsLabel } from "@/lib/plans/labels";
import { formatPrice, type PlanView } from "@/lib/plans/view";

/* One plan: its name, price and limits.

   The featured plan is an opaque aubergine surface rather than a light fill: a coloured border or a
   pale tint reads as "slightly different", an opaque surface reads as "this one". From `md` up it is
   also raised a step.

   `data-theme="dark"` on it switches the tokens to their dark values, so its text turns light.
   `text-ink` is set on the wrapper because text inside a themed element otherwise inherits the
   colour of `body`, not of the surface.

   The headline figure is the minutes, with their equivalent in hours underneath: students do not
   measure study time in minutes. The price covers a 30-day usage period, not a calendar month, and
   every figure comes from the backend. */

export function PlanCard({
  plan,
  /** True only when this is known to be the signed-in student's plan. */
  current = false,
}: {
  plan: PlanView;
  current?: boolean;
}) {
  const featured = plan.featured;
  const free = plan.price === 0;
  const hours = hoursLabel(plan);

  return (
    <div
      {...(featured ? { "data-theme": "dark" as const } : {})}
      className={`rounded-xl p-6 md:p-8 ${featured
        ? "bg-aubergine-deep text-ink shadow-lift md:-translate-y-3"
        : "border border-line bg-surface text-ink"
        }`}
    >
      {/* The tag's line is always reserved, so the cards stay aligned with or without one. */}
      <div className="flex min-h-8 items-start justify-between gap-2">
        <h3 className="text-lg font-bold text-ink">{plan.name}</h3>

        {current ? (
          <span className="shrink-0 rounded-pill border border-line px-3 py-1 text-xs font-semibold text-ink-2">
            Your current plan
          </span>
        ) : plan.badge ? (
          <span
            className={`shrink-0 rounded-pill px-3 py-1 text-xs font-semibold ${featured
              ? "bg-pressable text-on-pressable"
              : "border border-aubergine-mid text-aubergine-base"
              }`}
          >
            {plan.badge}
          </span>
        ) : null}
      </div>

      <p className="mt-5 flex items-baseline gap-2">
        {free ? null : <span className="text-ink-2">SAR</span>}
        <span className="font-display text-6xl leading-none font-bold text-ink">{formatPrice(plan.price)}</span>
        {free ? null : <span className="text-ink-2">every 30 days</span>}
      </p>
      <p className="mt-2 text-sm text-ink-2">{free ? "No card or subscription" : "VAT included"}</p>

      <div className={`mt-7 border-t pt-6 ${featured ? "border-aubergine-mid" : "border-line"}`}>
        <p className="font-display text-3xl leading-none font-bold text-ink">
          {plan.minutes === null ? "Unlimited minutes" : plan.minutes}
          <span className="ms-2 text-base font-normal text-ink-2">
            {plan.minutes === null ? "" : `${plan.minutes === 1 ? "minute" : "minutes"} `}every 30 days
          </span>
        </p>
        {hours ? <p className="mt-2 text-sm text-ink-2">{hours}</p> : null}
        <p className="mt-4 font-semibold text-ink">{coursesLabel(plan)}</p>
        <p className="mt-1 text-sm text-ink-2">{sessionsLabel(plan)} every 30 days</p>
      </div>
    </div>
  );
}
