import {
  findChapters,
  findCourse,
  findCourses,
  type CourseSummaryRow
} from "../repositories/catalog.repository.js";
import { AppError } from "../utils/app-error.js";
import type { Localized } from "./institution.service.js";

export type CourseSummary = {
  id: string;
  code: string;
  name: Localized;
  institution: { id: string; name: Localized };
  icon: CourseSummaryRow["icon"];
  tone: CourseSummaryRow["tone"];
  chapterCount: number;
  publishedChapterCount: number;
};

export type ChapterDto = {
  number: number;
  title: Localized;
  minutes: number;
  lessonCount: number;
  published: boolean;
};

export function toCourseSummary(row: CourseSummaryRow): CourseSummary {
  return {
    id: row.id,
    code: row.code,
    name: { ar: row.nameAr, en: row.nameEn },
    institution: {
      id: row.institution.id,
      name: { ar: row.institution.nameAr, en: row.institution.nameEn }
    },
    icon: row.icon,
    tone: row.tone,
    chapterCount: row.chapterCount,
    publishedChapterCount: row.publishedChapterCount
  };
}

export async function listCourses(institutionId?: string): Promise<CourseSummary[]> {
  return (await findCourses(institutionId)).map(toCourseSummary);
}

export async function getCourse(
  courseId: string
): Promise<CourseSummary & { chapters: ChapterDto[] }> {
  const row = await findCourse(courseId);
  if (!row) throw new AppError(404, "Course not found", "COURSE_NOT_FOUND");

  const chapters = await findChapters(courseId);
  return {
    ...toCourseSummary(row),
    chapters: chapters.map((chapter) => ({
      number: chapter.number,
      title: { ar: chapter.titleAr, en: chapter.titleEn },
      minutes: chapter.minutes,
      lessonCount: chapter.lessonCount,
      published: chapter.published
    }))
  };
}
