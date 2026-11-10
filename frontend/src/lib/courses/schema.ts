import { z } from "zod";
import { englishText } from "@/lib/api/english-text";
import { safeIcon, safeTone } from "./presentation";

const idSchema = z.string().regex(/^[a-z0-9][a-z0-9_-]{0,79}$/);
const countSchema = z.number().int().nonnegative();

export const courseSummarySchema = z.object({
  id: idSchema,
  code: z.string().min(1),
  name: englishText,
  institution: z.object({ id: idSchema, name: englishText }),
  icon: z.string().transform(safeIcon),
  tone: z.string().transform(safeTone),
  chapterCount: countSchema,
  publishedChapterCount: countSchema,
});

export const chapterSchema = z.object({
  number: z.number().int().positive(),
  title: englishText,
  minutes: z.number().int().positive(),
  lessonCount: countSchema,
  published: z.boolean(),
});

export const courseSchema = courseSummarySchema.extend({ chapters: z.array(chapterSchema) });
export const coursesSchema = z.array(courseSummarySchema);

export const enrollmentSchema = z.object({
  enrolledAt: z.string().datetime({ offset: true }),
  course: courseSummarySchema,
});
export const enrollmentsSchema = z.array(enrollmentSchema);

/** `POST /api/v1/livekit/token`: what the browser needs to join the tutor's room. */
export const tokenSchema = z.object({ token: z.string().min(1), serverUrl: z.string().url() });

export type CourseSummary = z.infer<typeof courseSummarySchema>;
export type Course = z.infer<typeof courseSchema>;
export type Chapter = z.infer<typeof chapterSchema>;
export type Enrollment = z.infer<typeof enrollmentSchema>;
