CREATE TABLE "plan" (
	"id" text PRIMARY KEY,
	"name_ar" text NOT NULL,
	"name_en" text NOT NULL,
	"sessions_per_period" integer,
	"seconds_per_period" integer,
	"max_active_enrollments" integer,
	"max_session_seconds" integer,
	"min_start_seconds" integer,
	CONSTRAINT "plan_id_slug_check" CHECK ("id" ~ '^[a-z0-9][a-z0-9_-]{0,79}$'),
	CONSTRAINT "plan_sessions_per_period_check" CHECK ("sessions_per_period" >= 0),
	CONSTRAINT "plan_seconds_per_period_check" CHECK ("seconds_per_period" >= 0),
	CONSTRAINT "plan_max_active_enrollments_check" CHECK ("max_active_enrollments" >= 0),
	CONSTRAINT "plan_max_session_seconds_check" CHECK ("max_session_seconds" >= 0),
	CONSTRAINT "plan_min_start_seconds_check" CHECK ("min_start_seconds" >= 0)
);
--> statement-breakpoint
CREATE TABLE "plan_assignment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"user_id" text NOT NULL,
	"plan_id" text NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone,
	"source" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "plan_assignment_source_check" CHECK ("source" IN ('default', 'payment')),
	CONSTRAINT "plan_assignment_end_check" CHECK ("ends_at" >= "starts_at")
);
--> statement-breakpoint
CREATE UNIQUE INDEX "plan_assignment_current_user_uidx" ON "plan_assignment" ("user_id") WHERE "ends_at" IS NULL;--> statement-breakpoint
ALTER TABLE "plan_assignment" ADD CONSTRAINT "plan_assignment_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "plan_assignment" ADD CONSTRAINT "plan_assignment_plan_id_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "plan"("id") ON DELETE RESTRICT;
--> statement-breakpoint
INSERT INTO "plan" (
  "id", "name_ar", "name_en", "sessions_per_period", "seconds_per_period",
  "max_active_enrollments", "max_session_seconds", "min_start_seconds"
) VALUES ('free', 'الباقة المجانية', 'Free plan', 6, 3600, 1, 1800, 180)
ON CONFLICT ("id") DO NOTHING;
--> statement-breakpoint
-- Account creation timestamps are stored without a time zone and represent UTC.
INSERT INTO "plan_assignment" ("user_id", "plan_id", "starts_at", "source")
SELECT "id", 'free', "created_at" AT TIME ZONE 'UTC', 'default' FROM "user"
ON CONFLICT ("user_id") WHERE "ends_at" IS NULL DO NOTHING;
