import Link from "next/link";
import { formatRenewalDate } from "@/lib/allowance/format";
import { ArrowForward } from "./icons";

/* Usage limits are shown as a block, never a dialog, so they cannot interrupt a running session.

   - Amber on the site and a quiet surface inside a session; red stays reserved for errors.
   - What the student achieved comes before what they are missing: the study time or the enrollments
     are named before the next step.
   - Course links are quiet, so the screen keeps a single amber primary button. "Compare plans" is
     that button unless the screen already has one, in which case `primary={false}` outlines it.
   - The wording is the general "a bigger plan", because the student may already be on the largest. */

type HeldCourse = { id: string; name: string };

export type CourseSlotQuota = { courses: HeldCourse[]; limit: number };

type QuotaBlockProps = { id?: string; surface?: "site" | "session"; primary?: boolean } & (
  | { kind: "used-up"; minutesStudied: number; sessionsUsed: number; renewalDate: Date }
  | ({ kind: "slots-full" } & CourseSlotQuota)
);

const plural = (count: number, one: string, other: string) => (count === 1 ? one : other);

const courseList = new Intl.ListFormat("en", { style: "long", type: "conjunction" });

/* The button follows its surface: the site's button sizes, or the session's (h-12, border-line). */
function ComparePlansLink({ surface, primary }: { surface: "site" | "session"; primary: boolean }) {
  const session = surface === "session";
  const shape = "group mt-5 inline-flex w-full items-center justify-center gap-3 rounded-pill font-semibold sm:w-auto";
  const size = session ? "h-12 px-6" : "h-14 px-8 text-lg";
  const solid =
    "bg-pressable text-on-pressable transition-transform duration-200 hover:-translate-y-1 hover:shadow-lift";
  const outline = `border ${session ? "border-line text-ink" : "border-aubergine-mid text-aubergine-base"}`;

  return (
    <Link href="/plans" className={`${shape} ${size} ${primary ? solid : outline}`}>
      Compare plans
      <ArrowForward className="h-5 w-5 transition-transform duration-200 group-hover:translate-x-1" />
    </Link>
  );
}

/** The held courses as a sentence list ("A, B, and C"), each one a link to its page. */
function CourseLinks({ courses }: { courses: HeldCourse[] }) {
  // The list is formatted over indexes, so each element part leads back to its course.
  return courseList.formatToParts(courses.map((_, index) => String(index))).map((part) => {
    if (part.type === "literal") return part.value;
    const course = courses[Number(part.value)];
    return (
      <Link
        key={course.id}
        href={`/courses/${course.id}`}
        className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-sm px-1 underline underline-offset-4 hover:text-aubergine-base"
      >
        {course.name}
      </Link>
    );
  });
}

export function QuotaBlock(props: QuotaBlockProps) {
  const surface = props.surface ?? "site";
  const skin = surface === "session" ? "border border-line bg-panel" : "bg-tint-amber";

  return (
    <section id={props.id} className={`max-w-2xl scroll-mt-6 rounded-xl p-5 text-ink md:p-6 ${skin}`}>
      {props.kind === "used-up" ? (
        <>
          <p className="text-lg leading-base font-semibold">
            You studied {props.minutesStudied} {plural(props.minutesStudied, "minute", "minutes")} in{" "}
            {props.sessionsUsed} {plural(props.sessionsUsed, "session", "sessions")}
          </p>
          {surface === "session" ? (
            <p className="mt-3 leading-base text-ink-2">
              You can start your next session on {formatRenewalDate(props.renewalDate)}
            </p>
          ) : (
            <>
              <p className="mt-3 leading-base text-ink-2">You’ve reached your usage limits for this period</p>
              <p className="mt-3 leading-base text-ink-2">
                Your usage limits renew on {formatRenewalDate(props.renewalDate)}
              </p>
            </>
          )}
          <p className="mt-3 leading-base text-ink-2">
            Want to keep studying now? A bigger plan gives you more minutes and sessions.
          </p>
          <ComparePlansLink surface={surface} primary={props.primary ?? true} />
        </>
      ) : (
        <>
          <p className="text-lg leading-base font-semibold">
            You’re enrolled in <CourseLinks courses={props.courses} />
          </p>
          <p className="mt-3 max-w-measure leading-base text-ink-2">
            Your usage limits allow {props.limit} {plural(props.limit, "course", "courses")} at a time
          </p>
          <p className="mt-3 max-w-measure leading-base text-ink-2">
            {props.courses.length === 1
              ? "Un-enroll from it to enroll here"
              : "Un-enroll from one of these courses to enroll here"}
          </p>
        </>
      )}
    </section>
  );
}
