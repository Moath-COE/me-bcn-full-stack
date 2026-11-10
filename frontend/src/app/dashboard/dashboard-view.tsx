import Link from "next/link";
import { CourseCardBody } from "@/app/courses/course-card";
import { TONES } from "@/lib/courses/presentation";
import { GhostButton, PageShell, PrimaryButton, SiteHeader } from "@/components/ui/kit";
import type { CourseSummary, Enrollment } from "@/lib/courses/schema";
import { QuotaBlock } from "@/components/ui/quota";
import type { UsedUpQuota } from "@/lib/allowance/presentation";

/** `enrollments` is `null` when they could not be loaded. */
export function DashboardView({ name, enrollments, quota }: {
  name: string;
  enrollments: Enrollment[] | null;
  quota: UsedUpQuota | null;
}) {
  return (
    <PageShell>
      <SiteHeader />

      <main className="mx-auto w-full max-w-page px-4 pt-10 pb-16 md:px-8 md:pt-14 xl:px-10">
        <p className="mb-4 break-words text-ink-2">Hello, {name}</p>

        {/* One amber primary button per screen: with no courses, "Browse courses" takes it and the
            quota block's button is outlined. */}
        {quota ? (
          <div className="mb-6">
            <QuotaBlock {...quota} primary={enrollments === null || enrollments.length > 0} />
          </div>
        ) : null}

        <h1 className="font-display text-3xl leading-tight font-bold text-ink md:text-4xl">My courses</h1>

        {enrollments === null ? (
          <p role="alert" className="mt-6 text-error">
            We couldn’t load your courses. Reload the page to try again.
          </p>
        ) : enrollments.length === 0 ? (
          <div className="mt-6">
            <p className="text-ink-2">You haven’t enrolled in any courses yet.</p>
            <PrimaryButton href="/courses" className="mt-6">Browse courses</PrimaryButton>
          </div>
        ) : (
          <>
            <ul className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {enrollments.map((enrollment) => (
                <li key={enrollment.course.id}><EnrolledCard course={enrollment.course} /></li>
              ))}
            </ul>
            <div className="mt-6"><GhostButton href="/courses">Add a course</GhostButton></div>
          </>
        )}
      </main>
    </PageShell>
  );
}

/* The same card as the catalog. A course with no published chapters stays a link, so the student
   can still manage the enrollment. */
function EnrolledCard({ course }: { course: CourseSummary }) {
  const tone = TONES[course.tone];
  return (
    <Link
      href={`/courses/${course.id}`}
      className={`group relative flex min-h-36 flex-col justify-between overflow-hidden rounded-lg border p-3 shadow-soft transition-transform duration-200 hover:-translate-y-1 hover:shadow-lift ${tone.card}`}
    >
      <CourseCardBody course={course} />
      {course.publishedChapterCount === 0 ? (
        <span className={`relative mt-2 w-fit rounded-pill border px-2 py-0.5 text-[11px] font-semibold ${tone.chip}`}>
          Coming soon
        </span>
      ) : null}
    </Link>
  );
}
