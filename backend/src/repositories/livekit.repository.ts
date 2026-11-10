import { and, eq, isNull } from "drizzle-orm";

import { db } from "../db/index.js";
import { chapter, enrollment } from "../db/schema/index.js";

export async function findChapterWithEnrollment(
  userId: string,
  courseId: string,
  chapterNumber: number
) {
  const [row] = await db
    .select({
      courseId: chapter.courseId,
      number: chapter.number,
      published: chapter.published,
      enrollmentId: enrollment.id
    })
    .from(chapter)
    .leftJoin(
      enrollment,
      and(
        eq(enrollment.courseId, chapter.courseId),
        eq(enrollment.userId, userId),
        isNull(enrollment.endedAt)
      )
    )
    .where(and(eq(chapter.courseId, courseId), eq(chapter.number, chapterNumber)));

  return row;
}

// An Admin Session needs only the Chapter: no Enrollment, and an unpublished Chapter is allowed.
export async function findChapter(courseId: string, chapterNumber: number) {
  const [row] = await db
    .select({
      courseId: chapter.courseId,
      number: chapter.number,
      published: chapter.published
    })
    .from(chapter)
    .where(and(eq(chapter.courseId, courseId), eq(chapter.number, chapterNumber)));

  return row;
}
