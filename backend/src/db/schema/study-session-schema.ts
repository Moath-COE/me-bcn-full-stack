import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid
} from "drizzle-orm/pg-core";

import { user } from "./auth-schema.js";
import { course } from "./catalog-schema.js";

export const studySession = pgTable(
  "study_session",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    courseId: text("course_id")
      .notNull()
      .references(() => course.id, { onDelete: "restrict" }),
    chapterNumber: integer("chapter_number").notNull(),
    grantedSeconds: integer("granted_seconds").notNull(),
    sessionLimit: text("session_limit", { enum: ["allowance", "session"] }).notNull(),
    issuedAt: timestamp("issued_at", { withTimezone: true }).notNull().defaultNow(),
    firstJoinedAt: timestamp("first_joined_at", { withTimezone: true }),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    endReason: text("end_reason", { enum: ["superseded", "no_leave_event"] }),
    // An Admin Session never counts toward Usage; see readSessionUsage.
    kind: text("kind", { enum: ["student", "admin"] })
      .notNull()
      .default("student")
  },
  (table) => [
    check("study_session_granted_seconds_check", sql`${table.grantedSeconds} > 0`),
    check(
      "study_session_limit_check",
      sql`${table.sessionLimit} IN ('allowance', 'session')`
    ),
    check(
      "study_session_end_reason_check",
      sql`${table.endReason} IN ('superseded', 'no_leave_event')`
    ),
    check("study_session_kind_check", sql`${table.kind} IN ('student', 'admin')`),
    index("study_session_user_issued_idx").on(table.userId, table.issuedAt)
  ]
);

export const studySessionPresence = pgTable(
  "study_session_presence",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => studySession.id, { onDelete: "cascade" }),
    joinedAt: timestamp("joined_at", { withTimezone: true }).notNull(),
    leftAt: timestamp("left_at", { withTimezone: true })
  },
  (table) => [index("study_session_presence_session_idx").on(table.sessionId)]
);

export const livekitWebhookEvent = pgTable("livekit_webhook_event", {
  id: text("id").primaryKey(),
  receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow()
});
