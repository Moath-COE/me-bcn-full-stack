import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CourseView, type ViewState } from "./course-view";
import { getCourse, getEnrollments } from "@/lib/courses/server";
import { getAllowance } from "@/lib/allowance/server";
import { slotsFull, startDecision } from "@/lib/allowance/rules";
import { usedUpQuota } from "@/lib/allowance/presentation";
import { getAccount } from "@/lib/auth/session";
import { PageShell, Section, SiteHeader } from "@/components/ui/kit";

export async function generateMetadata(props: PageProps<"/courses/[courseId]">): Promise<Metadata> {
  const { courseId } = await props.params;
  const result = await getCourse(courseId);
  if (!result.ok) return { title: "Course not found — Becan" };
  const course = result.data;
  const ready = course.publishedChapterCount;
  return {
    title: `${course.name} — Becan`,
    description: `${course.institution.name} · ${ready} ${ready === 1 ? "ready chapter" : "ready chapters"}.`,
  };
}

export default async function CoursePage(props: PageProps<"/courses/[courseId]">) {
  const { courseId } = await props.params;
  const search = await props.searchParams;
  const [result, account] = await Promise.all([getCourse(courseId), getAccount()]);
  if (!result.ok) notFound();
  const course = result.data;

  /* A signed-in account needs its allowance next to its enrollments: an enrolled student for the
     used-up block, and one who is not enrolled to learn whether the account is unlimited. */
  const [enrollments, allowance] = account ? await Promise.all([getEnrollments(), getAllowance()]) : [null, null];
  const enrollmentError = enrollments !== null && !enrollments.ok;
  const baseState: ViewState = !account
    ? "guest"
    : enrollments?.ok && enrollments.data.some((e) => e.course.id === course.id) ? "enrolled" : "new";

  /* An unlimited account starts any chapter without enrolling, including an unpublished one, so a
     chapter can be tested before it is published. */
  const viewer = allowance?.ok ? allowance.data : null;
  const state: ViewState = baseState === "new"
    && startDecision({ allowance: viewer, enrolled: false, published: true }).ok
    ? "open"
    : baseState;
  const opensUnpublished = startDecision({ allowance: viewer, enrolled: false, published: false }).ok;
  const slotQuota = viewer && viewer.limits.enrollments !== null && enrollments?.ok
    && slotsFull(viewer, enrollments.data, course.id)
    ? {
      limit: viewer.limits.enrollments,
      courses: enrollments.data.map(({ course: held }) => ({ id: held.id, name: held.name })),
    }
    : null;

  /* Whoever can start sessions here sees the used-up block once the allowance is spent. If it is not
     spent and the student arrives from a session that ended on its time limit (`?limit=1`), one
     sentence says so. */
  const startsHere = state === "enrolled" || state === "open";
  const usedUp = startsHere ? usedUpQuota(viewer) : null;
  const limitNotice = startsHere && usedUp === null && search.limit === "1";

  return (
    <PageShell withFooter>
      <SiteHeader />

      <Section className="pt-10 pb-16 md:pt-14">
        <CourseView
          course={course}
          enrollmentError={enrollmentError}
          state={state}
          opensUnpublished={opensUnpublished}
          slotQuota={slotQuota}
          usedUp={usedUp}
          limitNotice={limitNotice}
        />
      </Section>
    </PageShell>
  );
}
