import { asc, eq, sql } from "drizzle-orm";

import { db } from "../db/index.js";
import { chapter, course, institution } from "../db/schema/index.js";

// Count the joined Chapter key so a Course with no Chapters has zero, not one.
export const courseSummarySelection = {
  id: course.id,
  code: course.code,
  nameAr: course.nameAr,
  nameEn: course.nameEn,
  institution: {
    id: institution.id,
    nameAr: institution.nameAr,
    nameEn: institution.nameEn
  },
  icon: course.icon,
  tone: course.tone,
  chapterCount: sql`count(${chapter.number})`.mapWith(Number),
  publishedChapterCount:
    sql`count(${chapter.number}) FILTER (WHERE ${chapter.published})`.mapWith(Number)
};

export async function findCourses(institutionId?: string) {
  return db
    .select(courseSummarySelection)
    .from(course)
    .innerJoin(institution, eq(course.institutionId, institution.id))
    .leftJoin(chapter, eq(chapter.courseId, course.id))
    .where(
      institutionId === undefined ? undefined : eq(course.institutionId, institutionId)
    )
    .groupBy(course.id, institution.id)
    .orderBy(asc(institution.sortOrder), asc(course.sortOrder), asc(course.code));
}

export type CourseSummaryRow = Awaited<ReturnType<typeof findCourses>>[number];

export async function findCourse(courseId: string) {
  const [row] = await db
    .select(courseSummarySelection)
    .from(course)
    .innerJoin(institution, eq(course.institutionId, institution.id))
    .leftJoin(chapter, eq(chapter.courseId, course.id))
    .where(eq(course.id, courseId))
    .groupBy(course.id, institution.id);

  return row;
}

export async function findChapters(courseId: string) {
  return db
    .select({
      number: chapter.number,
      titleAr: chapter.titleAr,
      titleEn: chapter.titleEn,
      minutes: chapter.minutes,
      lessonCount: chapter.lessonCount,
      published: chapter.published
    })
    .from(chapter)
    .where(eq(chapter.courseId, courseId))
    .orderBy(asc(chapter.number));
}
