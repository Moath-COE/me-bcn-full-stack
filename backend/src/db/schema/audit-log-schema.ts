import { index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { user } from "./auth-schema.js";

// The Audit log (ADR 0003): one row per Admin action. Rows outlive what they describe, so
// `target_id` has no foreign key, and removing the acting Admin keeps their entries with a null
// `actor_id`. `before` and `after` hold only the fields that changed, never secrets; both are null
// for an Account removal.
export const adminAuditLog = pgTable(
  "admin_audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actorId: text("actor_id").references(() => user.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    targetType: text("target_type").notNull(),
    targetId: text("target_id").notNull(),
    before: jsonb("before").$type<Record<string, unknown>>(),
    after: jsonb("after").$type<Record<string, unknown>>(),
    reason: text("reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    index("admin_audit_log_created_at_idx").on(table.createdAt),
    index("admin_audit_log_actor_idx").on(table.actorId),
    index("admin_audit_log_target_idx").on(table.targetType, table.targetId)
  ]
);
