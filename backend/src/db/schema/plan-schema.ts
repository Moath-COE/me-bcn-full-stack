import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid
} from "drizzle-orm/pg-core";

import { user } from "./auth-schema.js";

export const plan = pgTable(
  "plan",
  {
    id: text("id").primaryKey(),
    nameAr: text("name_ar").notNull(),
    nameEn: text("name_en").notNull(),
    sessionsPerPeriod: integer("sessions_per_period"),
    secondsPerPeriod: integer("seconds_per_period"),
    maxActiveEnrollments: integer("max_active_enrollments"),
    maxSessionSeconds: integer("max_session_seconds"),
    minStartSeconds: integer("min_start_seconds"),
    // The price of one Period, VAT (15%) included, in halalas. The Free Plan's Price is 0.
    priceHalalas: integer("price_halalas").notNull().default(0),
    sortOrder: integer("sort_order").notNull().default(0),
    // Listed Plans are shown on the pricing pages; an unlisted Plan still exists and can be held.
    isListed: boolean("is_listed").notNull().default(true),
    featured: boolean("featured").notNull().default(false),
    badgeAr: text("badge_ar"),
    badgeEn: text("badge_en")
  },
  (table) => [
    check("plan_id_slug_check", sql`${table.id} ~ '^[a-z0-9][a-z0-9_-]{0,79}$'`),
    check("plan_sessions_per_period_check", sql`${table.sessionsPerPeriod} >= 0`),
    check("plan_seconds_per_period_check", sql`${table.secondsPerPeriod} >= 0`),
    check("plan_max_active_enrollments_check", sql`${table.maxActiveEnrollments} >= 0`),
    check("plan_max_session_seconds_check", sql`${table.maxSessionSeconds} >= 0`),
    check("plan_min_start_seconds_check", sql`${table.minStartSeconds} >= 0`),
    check("plan_price_halalas_check", sql`${table.priceHalalas} >= 0`),
    check(
      "plan_badge_pair_check",
      sql`(${table.badgeAr} IS NULL) = (${table.badgeEn} IS NULL)`
    ),
    check(
      "plan_session_budget_bounded_check",
      sql`${table.secondsPerPeriod} IS NOT NULL OR ${table.maxSessionSeconds} IS NOT NULL`
    )
  ]
);

export const planAssignment = pgTable(
  "plan_assignment",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    planId: text("plan_id")
      .notNull()
      .references(() => plan.id, { onDelete: "restrict" }),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }),
    source: text("source", { enum: ["default", "payment"] }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => [
    check("plan_assignment_source_check", sql`${table.source} IN ('default', 'payment')`),
    check("plan_assignment_end_check", sql`${table.endsAt} >= ${table.startsAt}`),
    uniqueIndex("plan_assignment_current_user_uidx")
      .on(table.userId)
      .where(sql`${table.endsAt} IS NULL`)
  ]
);
