import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { SessionView } from "@/components/session/session-view";
import { SessionUsedUp } from "@/components/session/session-start";
import { getCourse, getEnrollments } from "@/lib/courses/server";
import { getLessons } from "@/lib/session/lessons";
import { requireAccount } from "@/lib/auth/session";
import { accountReturnPath } from "@/lib/auth/next-path";
import { getAllowance } from "@/lib/allowance/server";
import { minutesLeft, nearlyOut, startDecision } from "@/lib/allowance/rules";
import { usedUpQuota } from "@/lib/allowance/presentation";

type Props = PageProps<"/session/[courseId]/[chapter]">;

export async function generateMetadata(props: Props): Promise<Metadata> {
  const { courseId, chapter: chapterNumber } = await props.params;
  const result = await getCourse(courseId);
  const course = result.ok ? result.data : null;
  const chapter = course?.chapters.find((c) => String(c.number) === chapterNumber);
  if (!course || !chapter) return { title: "Session — Becan" };
  return { title: `${chapter.title} — ${course.name} — Becan` };
}

export default async function SessionPage(props: Props) {
  const { courseId, chapter: chapterNumber } = await props.params;
  await requireAccount(
    accountReturnPath(`/session/${courseId}/${chapterNumber}`, await props.searchParams),
  );

  const [result, enrollments, allowanceResult] = await Promise.all([
    getCourse(courseId),
    getEnrollments(),
    getAllowance(),
  ]);
  if (!result.ok) notFound();
  const course = result.data;
  const chapter = course.chapters.find((c) => String(c.number) === chapterNumber);
  if (!chapter) notFound();

  const allowance = allowanceResult.ok ? allowanceResult.data : null;
  const decision = startDecision({
    allowance,
    enrolled: enrollments.ok && enrollments.data.some((e) => e.course.id === course.id),
    published: chapter.published,
  });
  if (!decision.ok) {
    if (decision.reason === "unpublished") notFound();
    if (decision.reason === "not-enrolled") redirect(`/courses/${course.id}`);
    const quota = usedUpQuota(allowance);
    if (quota) {
      return (
        <SessionUsedUp
          courseName={course.name}
          courseId={course.id}
          chapterNo={chapter.number}
          chapterTitle={chapter.title}
          quota={quota}
        />
      );
    }
  }

  const content = { courseId: course.id, chapterId: `ch_${chapter.number}` };
  const lessons = await getLessons(content);

  return (
    <SessionView
      courseName={course.name}
      courseId={course.id}
      chapterNo={chapter.number}
      chapterTitle={chapter.title}
      minutes={chapter.minutes}
      pdfUrl={`/api/content/courses/${course.id}/${content.chapterId}/slides.pdf`}
      lessons={lessons}
      minutesRemaining={allowance && nearlyOut(allowance) ? minutesLeft(allowance) : null}
    />
  );
}
