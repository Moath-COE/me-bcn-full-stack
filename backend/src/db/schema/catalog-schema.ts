import { defineRelationsPart, sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid
} from "drizzle-orm/pg-core";

import { user } from "./auth-schema.js";
import { institution } from "./institution-schema.js";

export const course = pgTable(
  "course",
  {
    id: text("id").primaryKey(),
    code: text("code").notNull(),
    nameAr: text("name_ar").notNull(),
    nameEn: text("name_en").notNull(),
    institutionId: text("institution_id")
      .notNull()
      .references(() => institution.id, { onDelete: "restrict" }),
    icon: text("icon", {
      enum: ["coins", "bars", "blocks", "torus", "flask", "atom", "donut", "cube", "bolt"]
    }).notNull(),
    tone: text("tone", {
      enum: ["lilac", "base", "deep", "amber", "walnut", "olive", "oliveDark"]
    }).notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at").defaultNow().notNull()
  },
  (table) => [
    check("course_id_slug_check", sql`${table.id} ~ '^[a-z0-9][a-z0-9_-]{0,79}$'`),
    check(
      "course_icon_check",
      sql`${table.icon} IN ('coins', 'bars', 'blocks', 'torus', 'flask', 'atom', 'donut', 'cube', 'bolt')`
    ),
    check(
      "course_tone_check",
      sql`${table.tone} IN ('lilac', 'base', 'deep', 'amber', 'walnut', 'olive', 'oliveDark')`
    ),
    index("course_institution_id_sort_idx").on(table.institutionId, table.sortOrder)
  ]
);

export const chapter = pgTable(
  "chapter",
  {
    courseId: text("course_id")
      .notNull()
      .references(() => course.id, { onDelete: "cascade" }),
    number: integer("number").notNull(),
    titleAr: text("title_ar").notNull(),
    titleEn: text("title_en").notNull(),
    minutes: integer("minutes").notNull(),
    lessonCount: integer("lesson_count").notNull(),
    published: boolean("published").notNull().default(false),
    createdAt: timestamp("created_at").defaultNow().notNull()
  },
  (table) => [
    primaryKey({ columns: [table.courseId, table.number] }),
    check("chapter_number_check", sql`${table.number} >= 1`),
    check("chapter_minutes_check", sql`${table.minutes} > 0`),
    check("chapter_lesson_count_check", sql`${table.lessonCount} >= 0`)
  ]
);

export const enrollmentEndReason = pgEnum("enrollment_end_reason", [
  "unenrolled",
  "ended_by_admin"
]);

export const enrollment = pgTable(
  "enrollment",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    courseId: text("course_id")
      .notNull()
      .references(() => course.id, { onDelete: "restrict" }),
    enrolledAt: timestamp("enrolled_at").notNull().defaultNow(),
    endedAt: timestamp("ended_at"),
    endReason: enrollmentEndReason("end_reason")
  },
  (table) => [
    check(
      "enrollment_end_check",
      sql`(${table.endedAt} IS NULL) = (${table.endReason} IS NULL)`
    ),
    uniqueIndex("enrollment_active_user_course_uidx")
      .on(table.userId, table.courseId)
      .where(sql`${table.endedAt} IS NULL`)
  ]
);

export const catalogRelations = defineRelationsPart(
  { course, chapter, enrollment, institution, user },
  (r) => ({
    course: {
      institution: r.one.institution({
        from: r.course.institutionId,
        to: r.institution.id
      }),
      chapters: r.many.chapter({ from: r.course.id, to: r.chapter.courseId }),
      enrollments: r.many.enrollment({ from: r.course.id, to: r.enrollment.courseId })
    },
    chapter: {
      course: r.one.course({ from: r.chapter.courseId, to: r.course.id })
    },
    enrollment: {
      course: r.one.course({ from: r.enrollment.courseId, to: r.course.id }),
      user: r.one.user({ from: r.enrollment.userId, to: r.user.id })
    }
  })
);
