CREATE TABLE "study_session" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"user_id" text NOT NULL,
	"course_id" text NOT NULL,
	"chapter_number" integer NOT NULL,
	"granted_seconds" integer NOT NULL,
	"session_limit" text NOT NULL,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"first_joined_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	"end_reason" text,
	CONSTRAINT "study_session_granted_seconds_check" CHECK ("granted_seconds" > 0),
	CONSTRAINT "study_session_limit_check" CHECK ("session_limit" IN ('allowance', 'session')),
	CONSTRAINT "study_session_end_reason_check" CHECK ("end_reason" IN ('superseded'))
);
--> statement-breakpoint
CREATE INDEX "study_session_user_issued_idx" ON "study_session" ("user_id","issued_at");--> statement-breakpoint
ALTER TABLE "study_session" ADD CONSTRAINT "study_session_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "study_session" ADD CONSTRAINT "study_session_course_id_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "course"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "plan" ADD CONSTRAINT "plan_session_budget_bounded_check" CHECK ("seconds_per_period" IS NOT NULL OR "max_session_seconds" IS NOT NULL);