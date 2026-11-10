import "server-only";

import { fetchContent } from "./content-storage";
import type { Lesson } from "./session-reducer";
import type { ChapterContent } from "./types";

function isLessonLike(value: unknown): value is { name: string; slug: string; brief?: unknown } {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { name?: unknown }).name === "string" &&
    typeof (value as { slug?: unknown }).slug === "string"
  );
}

/** A chapter's lesson list, expected as `{ lessons: [{ name, brief, slug }] }`. Empty when it cannot be read. */
export async function getLessons(content: ChapterContent): Promise<Lesson[]> {
  try {
    const response = await fetchContent(`courses/${content.courseId}/${content.chapterId}/lessons_list.json`);
    if (!response?.ok) return [];

    const data: unknown = await response.json();
    const list =
      typeof data === "object" && data !== null && Array.isArray((data as { lessons?: unknown }).lessons)
        ? (data as { lessons: unknown[] }).lessons
        : [];

    return list.filter(isLessonLike).map((lesson) => ({
      name: lesson.name,
      slug: lesson.slug,
      brief: typeof lesson.brief === "string" ? lesson.brief : "",
    }));
  } catch (error) {
    console.error("Failed to load lessons list:", error);
    return [];
  }
}
